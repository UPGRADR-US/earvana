import AVFoundation
import Foundation

/// Ping-pong AVAudioPlayerNodes with equal-power crossfades — proven iOS playback path.
final class CrossfadeLoopPlayer {
    private static let eqFrequencies: [Float] = [100, 330, 1000, 3300, 10000]
    private static let eqQValues: [Float] = [0.9, 1.0, 1.0, 1.0, 0.9]

    private let engine = AVAudioEngine()
    private let playerA = AVAudioPlayerNode()
    private let playerB = AVAudioPlayerNode()
    private let outputMixer = AVAudioMixerNode()
    private let eqUnit = AVAudioUnitEQ(numberOfBands: 5)
    private let notchUnit = AVAudioUnitEQ(numberOfBands: 1)
    private let boostUnit = AVAudioUnitEQ(numberOfBands: 1)
    private var eqGains: [Float] = [0, 0, 0, 0, 0]
    private var notchFreq: Float?
    private var boostFreq: Float?

    private var audioFile: AVAudioFile?
    private var loopStartFrame: AVAudioFramePosition = 0
    private var regionFrames: AVAudioFrameCount = 0
    private var sampleRate: Double = 44100

    private var loopStart: TimeInterval = 0
    private var loopEnd: TimeInterval = 0
    private var regionDuration: TimeInterval = 0
    private var crossfadeDuration: TimeInterval = 40

    private var currentSlot = 0
    private(set) var isPlaying = false
    private var trackVolume: Float = 0.5
    private var masterVolume: Float = 0.8
    /// Play/pause fade — unaffected by cancelFade (matches web fadeGain vs trackGain split).
    private var fadeMultiplier: Float = 1.0
    /// Countdown timer fade only — reset by cancelFade.
    private var timerFadeLevel: Float = 1.0

    private var crossfadeWorkItem: DispatchWorkItem?
    private var volumeRampTimer: Timer?
    private var fadeMultiplierTimer: Timer?
    private var timerFadeTimer: Timer?
    private var fadeOutWorkItem: DispatchWorkItem?
    private var stopWorkItem: DispatchWorkItem?

    /// Cap just under regionDuration/2 so the in-curve finishes before the next
    /// crossfade reuses the same player. /2.2 leaves margin while allowing 30–45s fades.
    private var effectiveXfade: TimeInterval {
        min(crossfadeDuration, regionDuration / 2.2)
    }

    private var outputLevel: Float {
        min(1, max(0, trackVolume * masterVolume * fadeMultiplier * timerFadeLevel))
    }

    private var activePlayer: AVAudioPlayerNode { currentSlot == 0 ? playerA : playerB }
    private var idlePlayer: AVAudioPlayerNode { currentSlot == 0 ? playerB : playerA }

    func play(
        url: URL,
        loopStart: TimeInterval = 0,
        loopEnd: TimeInterval? = nil,
        crossfade: TimeInterval = 40,
        volume: Float,
        master: Float,
        fadeIn: TimeInterval = 1.5,
        skipFadeIn: Bool = false,
        eqGains: [Float] = [0, 0, 0, 0, 0],
        notchFreq: Float? = nil,
        boostFreq: Float? = nil
    ) throws {
        stop(immediate: true)

        let file = try AVAudioFile(forReading: url)
        let format = file.processingFormat
        sampleRate = format.sampleRate
        let fileDuration = Double(file.length) / sampleRate

        audioFile = file
        self.loopStart = max(0, loopStart)
        self.loopEnd = loopEnd ?? fileDuration
        if self.loopEnd <= self.loopStart { self.loopEnd = fileDuration }
        regionDuration = self.loopEnd - self.loopStart
        crossfadeDuration = crossfade

        loopStartFrame = AVAudioFramePosition(self.loopStart * sampleRate)
        let loopEndFrame = AVAudioFramePosition(self.loopEnd * sampleRate)
        let frames = loopEndFrame - loopStartFrame
        guard frames > 0 else {
            throw NSError(domain: "EarvanaAudio", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid loop region"])
        }
        regionFrames = AVAudioFrameCount(frames)

        trackVolume = volume
        masterVolume = master
        fadeMultiplier = skipFadeIn ? 1.0 : 0.0
        timerFadeLevel = 1.0
        self.eqGains = Self.normalizedEqGains(eqGains)
        self.notchFreq = notchFreq
        self.boostFreq = boostFreq

        engine.attach(playerA)
        engine.attach(playerB)
        engine.attach(outputMixer)
        engine.attach(eqUnit)
        engine.attach(notchUnit)
        engine.attach(boostUnit)
        applyEqBands()
        applyNotchBand()
        applyBoostBand()
        engine.connect(playerA, to: outputMixer, format: format)
        engine.connect(playerB, to: outputMixer, format: format)
        engine.connect(outputMixer, to: eqUnit, format: format)
        engine.connect(eqUnit, to: notchUnit, format: format)
        engine.connect(notchUnit, to: boostUnit, format: format)
        engine.connect(boostUnit, to: engine.outputNode, format: format)

        playerA.volume = 1
        playerB.volume = 0
        outputMixer.outputVolume = outputLevel

        try engine.start()
        isPlaying = true
        currentSlot = 0

        scheduleSlot(playerA, isFirst: true)

        if skipFadeIn {
            fadeMultiplier = 1
            outputMixer.outputVolume = outputLevel
        } else {
            rampFadeMultiplier(to: 1, duration: fadeIn)
        }
    }

    func pause(fadeSeconds: TimeInterval, immediate: Bool, completion: (() -> Void)? = nil) {
        guard isPlaying else {
            completion?()
            return
        }
        isPlaying = false
        cancelNativeTimer()
        cancelCrossfadeSchedule()
        volumeRampTimer?.invalidate()
        volumeRampTimer = nil

        let finish = { [weak self] in
            guard let self = self else { return }
            self.playerA.stop()
            self.playerB.stop()
            self.engine.stop()
            self.engine.reset()
            self.audioFile = nil
            completion?()
        }

        if immediate || fadeSeconds <= 0 {
            fadeMultiplier = 0
            finish()
            return
        }

        rampFadeMultiplier(to: 0, duration: fadeSeconds) {
            finish()
        }
    }

    func stop(immediate: Bool = true) {
        isPlaying = false
        cancelNativeTimer()
        cancelCrossfadeSchedule()
        volumeRampTimer?.invalidate()
        volumeRampTimer = nil
        fadeMultiplierTimer?.invalidate()
        fadeMultiplierTimer = nil
        timerFadeTimer?.invalidate()
        timerFadeTimer = nil
        playerA.stop()
        playerB.stop()
        if engine.isRunning {
            engine.stop()
        }
        engine.reset()
        audioFile = nil
        fadeMultiplier = 1
        timerFadeLevel = 1
    }

    func setVolume(track: Float?, master: Float?) {
        if let track = track { trackVolume = track }
        if let master = master { masterVolume = master }
        outputMixer.outputVolume = outputLevel
    }

    func setEq(gains: [Float]) {
        eqGains = Self.normalizedEqGains(gains)
        applyEqBands()
    }

    func setNotch(freq: Float?) {
        notchFreq = freq
        if freq != nil {
            boostFreq = nil
            applyBoostBand()
        }
        applyNotchBand()
    }

    func setBoost(freq: Float?) {
        boostFreq = freq
        if freq != nil {
            notchFreq = nil
            applyNotchBand()
        }
        applyBoostBand()
    }

    func fadeOut(duration: TimeInterval, completion: (() -> Void)? = nil) {
        guard isPlaying else {
            completion?()
            return
        }
        rampTimerFade(to: 0.0001, duration: duration, completion: completion)
    }

    func cancelFade() {
        timerFadeTimer?.invalidate()
        timerFadeTimer = nil
        timerFadeLevel = 1
        outputMixer.outputVolume = outputLevel
    }

    func setPlayDuration(seconds: TimeInterval, onStop: @escaping () -> Void) {
        cancelNativeTimer()
        
        guard seconds > 0 else { return }
        
        let fadeDuration: TimeInterval = 60
        let fadeDelay = max(0, seconds - fadeDuration)
        
        // 1. Schedule the fade-out
        let fadeWork = DispatchWorkItem { [weak self] in
            guard let self = self, self.isPlaying else { return }
            self.fadeOut(duration: fadeDuration)
        }
        fadeOutWorkItem = fadeWork
        DispatchQueue.main.asyncAfter(deadline: .now() + fadeDelay, execute: fadeWork)
        
        // 2. Schedule the stop/pause
        let stopWork = DispatchWorkItem { [weak self] in
            guard let self = self, self.isPlaying else { return }
            self.stop(immediate: true)
            onStop()
        }
        stopWorkItem = stopWork
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: stopWork)
    }

    func cancelNativeTimer() {
        fadeOutWorkItem?.cancel()
        fadeOutWorkItem = nil
        stopWorkItem?.cancel()
        stopWorkItem = nil
    }

    private static func normalizedEqGains(_ gains: [Float]) -> [Float] {
        var out = [Float](repeating: 0, count: 5)
        for i in 0..<min(5, gains.count) { out[i] = gains[i] }
        return out
    }

    private func applyEqBands() {
        for i in 0..<5 {
            let band = eqUnit.bands[i]
            band.filterType = .parametric
            band.frequency = Self.eqFrequencies[i]
            band.bandwidth = 1.0 / Self.eqQValues[i]
            band.gain = eqGains[i]
            band.bypass = false
        }
    }

    private func applyNotchBand() {
        let band = notchUnit.bands[0]
        // Parametric cut mirrors Web Audio BiquadFilter "notch" (Q=30) more reliably than bandStop.
        band.filterType = .parametric
        band.bypass = false
        if let freq = notchFreq {
            band.frequency = freq
            band.bandwidth = 1.0 / 30.0
            band.gain = -50
        } else {
            band.frequency = 22050
            band.bandwidth = 1.0 / 1000.0
            band.gain = 0
        }
    }

    private func applyBoostBand() {
        let band = boostUnit.bands[0]
        band.filterType = .parametric
        band.bypass = false
        if let freq = boostFreq {
            band.frequency = freq
            band.bandwidth = 1.0 / 30.0
            band.gain = 12
        } else {
            band.frequency = 22050
            band.bandwidth = 1.0 / 1000.0
            band.gain = 0
        }
    }

    private func scheduleSlot(_ player: AVAudioPlayerNode, isFirst: Bool) {
        guard isPlaying, let file = audioFile else { return }

        player.stop()
        player.volume = isFirst ? 1 : 0
        player.scheduleSegment(
            file,
            startingFrame: loopStartFrame,
            frameCount: regionFrames,
            at: nil,
            completionCallbackType: .dataPlayedBack,
            completionHandler: nil
        )

        if !player.isPlaying {
            player.play()
        }

        queueNextCrossfade()
    }

    private func queueNextCrossfade() {
        cancelCrossfadeSchedule()
        let xfade = effectiveXfade
        let delay = max(0.05, regionDuration - xfade)
        let work = DispatchWorkItem { [weak self] in
            self?.performCrossfade()
        }
        crossfadeWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func performCrossfade() {
        guard isPlaying, audioFile != nil else { return }

        volumeRampTimer?.invalidate()
        volumeRampTimer = nil

        let outPlayer = activePlayer
        let inPlayer = idlePlayer
        let xfade = effectiveXfade

        inPlayer.stop()
        inPlayer.volume = 0
        scheduleSlot(inPlayer, isFirst: false)

        animateEqualPowerCrossfade(out: outPlayer, in: inPlayer, duration: xfade) {
            outPlayer.stop()
        }

        currentSlot = 1 - currentSlot
    }

    private func animateEqualPowerCrossfade(
        out: AVAudioPlayerNode,
        in inNode: AVAudioPlayerNode,
        duration: TimeInterval,
        completion: @escaping () -> Void
    ) {
        volumeRampTimer?.invalidate()
        volumeRampTimer = nil

        let startUptime = ProcessInfo.processInfo.systemUptime
        out.volume = 1
        inNode.volume = 0

        let updateInterval: TimeInterval = 1.0 / 30.0
        volumeRampTimer = Timer.scheduledTimer(withTimeInterval: updateInterval, repeats: true) { [weak self] timer in
            guard let self = self, self.isPlaying else {
                timer.invalidate()
                self?.volumeRampTimer = nil
                return
            }
            let elapsed = ProcessInfo.processInfo.systemUptime - startUptime
            let t = min(1.0, max(0.0, elapsed / duration))
            let outV = sinf(Float(1.0 - t) * Float.pi / 2)
            let inV = sinf(Float(t) * Float.pi / 2)
            out.volume = outV
            inNode.volume = inV
            if t >= 1.0 {
                timer.invalidate()
                self.volumeRampTimer = nil
                inNode.volume = 1
                out.volume = 0
                completion()
            }
        }
        if let volumeRampTimer = volumeRampTimer {
            RunLoop.main.add(volumeRampTimer, forMode: .common)
        }
    }

    private func rampFadeMultiplier(to target: Float, duration: TimeInterval, completion: (() -> Void)? = nil) {
        fadeMultiplierTimer?.invalidate()
        let start = fadeMultiplier
        let steps = max(1, Int(duration / 0.04))
        var step = 0
        fadeMultiplierTimer = Timer.scheduledTimer(withTimeInterval: duration / Double(steps), repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            step += 1
            let t = Float(step) / Float(steps)
            self.fadeMultiplier = start + (target - start) * t
            self.outputMixer.outputVolume = self.outputLevel
            if step >= steps {
                timer.invalidate()
                self.fadeMultiplierTimer = nil
                self.fadeMultiplier = target
                self.outputMixer.outputVolume = self.outputLevel
                completion?()
            }
        }
        if let fadeMultiplierTimer = fadeMultiplierTimer {
            RunLoop.main.add(fadeMultiplierTimer, forMode: .common)
        }
    }

    private func rampTimerFade(to target: Float, duration: TimeInterval, completion: (() -> Void)? = nil) {
        timerFadeTimer?.invalidate()
        let start = timerFadeLevel
        let steps = max(1, Int(duration / 0.04))
        var step = 0
        timerFadeTimer = Timer.scheduledTimer(withTimeInterval: duration / Double(steps), repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            step += 1
            let t = Float(step) / Float(steps)
            self.timerFadeLevel = start + (target - start) * t
            self.outputMixer.outputVolume = self.outputLevel
            if step >= steps {
                timer.invalidate()
                self.timerFadeTimer = nil
                self.timerFadeLevel = target
                self.outputMixer.outputVolume = self.outputLevel
                completion?()
            }
        }
        if let timerFadeTimer = timerFadeTimer {
            RunLoop.main.add(timerFadeTimer, forMode: .common)
        }
    }

    private func cancelCrossfadeSchedule() {
        crossfadeWorkItem?.cancel()
        crossfadeWorkItem = nil
    }
}