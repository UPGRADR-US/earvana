import Capacitor
import AVFoundation

// ═════════════════════════════════════════════════════════════════════════════
// EarvanaAudioPlugin — Capacitor bridge to the proven CrossfadeLoopPlayer
// (dedicated AVAudioEngine per session: EQ / notch / boost / ping-pong loops).
// Do not use WKWebView Web Audio for therapy playback on iOS.
// ═════════════════════════════════════════════════════════════════════════════
@objc(EarvanaAudioPlugin)
public class EarvanaAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EarvanaAudioPlugin"
    public let jsName = "EarvanaAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMasterVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEq", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNotch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBoost", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startFadeOut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelFade", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPlayDuration", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLastPlayed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLastPlayed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playTestTone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTestTone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTestToneGain", returnType: CAPPluginReturnPromise),
    ]

    private var loopPlayer: CrossfadeLoopPlayer?
    private var tonePlayer: DiagnosticTonePlayer?
    private var activeTrackId: String?
    private var trackVolumes: [String: Float] = [:]
    private var masterVolume: Float = 0.8
    private var eqGains: [Float] = [0, 0, 0, 0, 0]
    private var notchFreq: Float?
    private var boostFreq: Float?

    private func parseOptionalFreq(from call: CAPPluginCall) -> Float? {
        guard call.options["freq"] != nil else { return nil }
        if let value = call.getFloat("freq") { return value }
        if let value = call.getDouble("freq") { return Float(value) }
        if let value = call.getInt("freq") { return Float(value) }
        if let number = call.options["freq"] as? NSNumber { return number.floatValue }
        return nil
    }

    private func applyTherapyToPlayer() {
        loopPlayer?.setNotch(freq: notchFreq)
        loopPlayer?.setBoost(freq: boostFreq)
    }

    private func ensureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("[EarvanaAudioPlugin] session activation failed: \(error)")
        }
    }

    private func buildStatus() -> [String: [String: Any]] {
        guard let id = activeTrackId else { return [:] }
        return [id: [
            "isPlaying": loopPlayer?.isPlaying ?? false,
            "isLoading": false,
            "hasError": false,
            "volume": trackVolumes[id] ?? 0.5,
        ]]
    }

    /// Resolve "sounds/foo.mp3" (relative to Capacitor public webDir) to a file URL.
    private static func resolveAudioURL(_ filePath: String) -> URL? {
        if filePath.hasPrefix("/") {
            let url = URL(fileURLWithPath: filePath)
            if FileManager.default.fileExists(atPath: url.path) { return url }
        }

        let components = filePath.split(separator: "/").map(String.init)
        guard let name = components.last else { return nil }
        let ext  = (name as NSString).pathExtension
        let base = (name as NSString).deletingPathExtension
        let subdir = components.count > 1 ? components.dropLast().joined(separator: "/") : nil

        var directoryCandidates: [String?] = []
        if let subdir = subdir {
            directoryCandidates.append("public/\(subdir)")
            directoryCandidates.append(subdir)
        } else {
            directoryCandidates.append("public")
            directoryCandidates.append(nil)
        }

        for dir in directoryCandidates {
            if let path = Bundle.main.path(forResource: base, ofType: ext, inDirectory: dir) {
                return URL(fileURLWithPath: path)
            }
        }

        if let resourcePath = Bundle.main.resourcePath {
            let candidates = [
                (resourcePath as NSString).appendingPathComponent("public/\(filePath)"),
                (resourcePath as NSString).appendingPathComponent(filePath),
            ]
            for path in candidates where FileManager.default.fileExists(atPath: path) {
                return URL(fileURLWithPath: path)
            }
        }

        return nil
    }

    // MARK: — Bridge methods

    @objc func play(_ call: CAPPluginCall) {
        ensureAudioSession()

        guard let trackId = call.getString("trackId"),
              let filePath = call.getString("filePath") else {
            call.reject("Missing trackId or filePath")
            return
        }

        guard let url = Self.resolveAudioURL(filePath) else {
            call.reject("File not found: \(filePath)")
            return
        }

        let volume = trackVolumes[trackId] ?? call.getFloat("volume") ?? 0.5
        trackVolumes[trackId] = volume
        let crossfade = call.getDouble("crossfadeDuration") ?? 40
        let loopStart = call.getDouble("loopStart") ?? 0
        let loopEnd = call.getDouble("loopEnd")

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            do {
                self.loopPlayer?.stop(immediate: true)
                let player = CrossfadeLoopPlayer()
                try player.play(
                    url: url,
                    loopStart: loopStart,
                    loopEnd: loopEnd,
                    crossfade: crossfade,
                    volume: volume,
                    master: self.masterVolume,
                    fadeIn: 1.5,
                    skipFadeIn: false,
                    eqGains: self.eqGains,
                    notchFreq: self.notchFreq,
                    boostFreq: self.boostFreq
                )
                self.loopPlayer = player
                self.activeTrackId = trackId
                self.applyTherapyToPlayer()
                self.notifyListeners("statusChange", data: ["tracks": self.buildStatus()])
                call.resolve()
            } catch {
                call.reject("Play failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        guard let trackId = call.getString("trackId") else {
            call.reject("Missing trackId")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard trackId == self.activeTrackId else {
                call.resolve()
                return
            }
            self.loopPlayer?.pause(fadeSeconds: 0.75, immediate: false) { [weak self] in
                self?.loopPlayer = nil
                self?.activeTrackId = nil
            }
            self.notifyListeners("statusChange", data: ["tracks": self.buildStatus()])
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        ensureAudioSession()
        call.resolve()
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        guard let trackId = call.getString("trackId"),
              let volume = call.getFloat("volume") else {
            call.reject("Missing trackId or volume")
            return
        }
        trackVolumes[trackId] = volume
        if trackId == activeTrackId {
            loopPlayer?.setVolume(track: volume, master: nil)
        }
        notifyListeners("statusChange", data: ["tracks": buildStatus()])
        call.resolve()
    }

    @objc func setMasterVolume(_ call: CAPPluginCall) {
        guard let volume = call.getFloat("volume") else {
            call.reject("Missing volume")
            return
        }
        masterVolume = volume
        loopPlayer?.setVolume(track: nil, master: volume)
        call.resolve()
    }

    @objc func setEq(_ call: CAPPluginCall) {
        guard let gains = call.getArray("gains", Float.self) else {
            call.reject("Missing gains array")
            return
        }
        eqGains = gains
        loopPlayer?.setEq(gains: gains)
        call.resolve()
    }

    @objc func setNotch(_ call: CAPPluginCall) {
        if call.options["freq"] != nil {
            guard let freq = parseOptionalFreq(from: call) else {
                call.reject("Invalid freq")
                return
            }
            notchFreq = freq
            boostFreq = nil
        } else {
            notchFreq = nil
        }
        DispatchQueue.main.async { [weak self] in
            self?.applyTherapyToPlayer()
            call.resolve()
        }
    }

    @objc func setBoost(_ call: CAPPluginCall) {
        if call.options["freq"] != nil {
            guard let freq = parseOptionalFreq(from: call) else {
                call.reject("Invalid freq")
                return
            }
            boostFreq = freq
            notchFreq = nil
        } else {
            boostFreq = nil
        }
        DispatchQueue.main.async { [weak self] in
            self?.applyTherapyToPlayer()
            call.resolve()
        }
    }

    @objc func startFadeOut(_ call: CAPPluginCall) {
        guard let duration = call.getDouble("durationSeconds") else {
            call.reject("Missing durationSeconds")
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.loopPlayer?.fadeOut(duration: duration)
            call.resolve()
        }
    }

    @objc func cancelFade(_ call: CAPPluginCall) {
        loopPlayer?.cancelFade()
        call.resolve()
    }

    @objc func setPlayDuration(_ call: CAPPluginCall) {
        guard let duration = call.getDouble("durationSeconds") else {
            call.reject("Missing durationSeconds")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.loopPlayer?.setPlayDuration(seconds: duration) { [weak self] in
                guard let self = self else { return }
                self.loopPlayer = nil
                self.activeTrackId = nil
                self.notifyListeners("statusChange", data: ["tracks": self.buildStatus()])
            }
            call.resolve()
        }
    }

    @objc func stopAll(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve()
                return
            }
            self.loopPlayer?.stop(immediate: true)
            self.loopPlayer = nil
            self.activeTrackId = nil
            // Also silence any diagnostic tone so calibration starts clean
            self.tonePlayer?.stop()
            self.tonePlayer = nil
            self.notifyListeners("statusChange", data: ["tracks": self.buildStatus()])
            call.resolve()
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(["tracks": buildStatus()])
    }

    @objc func setLastPlayed(_ call: CAPPluginCall) {
        guard let id = call.getString("trackId") else {
            call.reject("Missing trackId")
            return
        }
        UserDefaults.standard.set(id, forKey: "earvana_last_played")
        call.resolve()
    }

    @objc func getLastPlayed(_ call: CAPPluginCall) {
        let id = UserDefaults.standard.string(forKey: "earvana_last_played")
        call.resolve(["trackId": id ?? NSNull()])
    }

    @objc func playTestTone(_ call: CAPPluginCall) {
        guard let freq = call.getDouble("freq") else {
            call.reject("Missing freq")
            return
        }
        let gain = call.getFloat("gain") ?? 0.12
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.ensureAudioSession()
            do {
                let player = self.tonePlayer ?? DiagnosticTonePlayer()
                try player.play(frequency: freq, gain: gain)
                self.tonePlayer = player
                call.resolve()
            } catch {
                call.reject("Test tone failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func stopTestTone(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.tonePlayer?.stop()
            self?.tonePlayer = nil
            call.resolve()
        }
    }

    @objc func setTestToneGain(_ call: CAPPluginCall) {
        guard let gain = call.getFloat("gain") else {
            call.reject("Missing gain")
            return
        }
        tonePlayer?.setGain(gain)
        call.resolve()
    }
}
