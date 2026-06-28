import Capacitor
import AVFoundation

// ═════════════════════════════════════════════════════════════════════════════
// EarvanaAudioPlugin — Capacitor bridge exposing the native AVAudioEngine
// graph to the JavaScript side.
// ═════════════════════════════════════════════════════════════════════════════
@objc(EarvanaAudioPlugin)
public class EarvanaAudioPlugin: CAPPlugin {

    private let graph = AudioGraph.shared

    // Activate audio session on first interaction
    private func ensureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("[EarvanaAudioPlugin] session activation failed: \(error)")
        }
    }

    // MARK: — Bridge methods

    @objc func play(_ call: CAPPluginCall) {
        ensureAudioSession()
        graph.ensureRunning()

        guard let trackId = call.getString("trackId"),
              let filePath = call.getString("filePath") else {
            call.reject("Missing trackId or filePath")
            return
        }

        let te = graph.getOrCreateTrackEngine(id: trackId, filePath: filePath)
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try te.load()
                DispatchQueue.main.async {
                    te.play(fadeIn: 1.5)
                    self.notifyListeners("statusChange", data: ["tracks": self.graph.buildStatus()])
                    call.resolve()
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Load failed: \(error.localizedDescription)")
                }
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        guard let trackId = call.getString("trackId") else {
            call.reject("Missing trackId")
            return
        }
        graph.trackEngines[trackId]?.stop(false)
        notifyListeners("statusChange", data: ["tracks": graph.buildStatus()])
        call.resolve()
    }

    @objc func resume(_ call: CAPPluginCall) {
        ensureAudioSession()
        graph.ensureRunning()
        call.resolve()
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        guard let trackId = call.getString("trackId"),
              let volume = call.getFloat("volume") else {
            call.reject("Missing trackId or volume")
            return
        }
        graph.trackEngines[trackId]?.volume = volume
        notifyListeners("statusChange", data: ["tracks": graph.buildStatus()])
        call.resolve()
    }

    @objc func setMasterVolume(_ call: CAPPluginCall) {
        guard let volume = call.getFloat("volume") else {
            call.reject("Missing volume")
            return
        }
        graph.setMasterVolume(volume)
        call.resolve()
    }

    @objc func setEq(_ call: CAPPluginCall) {
        guard let gains = call.getArray("gains", Float.self) else {
            call.reject("Missing gains array")
            return
        }
        graph.setEq(gains: gains)
        call.resolve()
    }

    @objc func setNotch(_ call: CAPPluginCall) {
        if let freq = call.getFloat("freq") {
            graph.setNotch(freq: freq)
        } else {
            graph.setNotch(freq: nil)
        }
        call.resolve()
    }

    @objc func setBoost(_ call: CAPPluginCall) {
        if let freq = call.getFloat("freq") {
            graph.setBoost(freq: freq)
        } else {
            graph.setBoost(freq: nil)
        }
        call.resolve()
    }

    @objc func startFadeOut(_ call: CAPPluginCall) {
        guard let duration = call.getDouble("durationSeconds") else {
            call.reject("Missing durationSeconds")
            return
        }
        graph.startFadeOut(durationSeconds: duration)
        call.resolve()
    }

    @objc func cancelFade(_ call: CAPPluginCall) {
        graph.cancelFadeOut()
        call.resolve()
    }

    @objc func stopAll(_ call: CAPPluginCall) {
        graph.stopAll()
        notifyListeners("statusChange", data: ["tracks": graph.buildStatus()])
        call.resolve()
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(["tracks": graph.buildStatus()])
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
}
