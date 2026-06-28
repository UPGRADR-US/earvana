import AVFoundation

// ═════════════════════════════════════════════════════════════════════════════
// AudioGraph — singleton AVAudioEngine with global 5-band EQ, notch, boost,
// fade and master-volume chain.  All track mixers feed into masterMixer.
// ═════════════════════════════════════════════════════════════════════════════
class AudioGraph {
    static let shared = AudioGraph()

    let engine = AVAudioEngine()

    // Global processing chain
    private let eqNode: AVAudioUnitEQ
    private let notchNode: AVAudioUnitEQ
    private let boostNode: AVAudioUnitEQ
    let fadeMixer: AVAudioMixerNode
    private let masterMixer: AVAudioMixerNode

    // Active track engines keyed by track id
    private(set) var trackEngines: [String: TrackEngine] = [:]

    private var isRunning = false
    private var fadeOutTimer: Timer?

    private let eqFreqs: [Float]   = [100, 330, 1000, 3300, 10000]
    // Approximate octave bandwidths derived from Q values:
    // Q≈0.9 → BW≈1.5 octaves, Q≈1.0 → BW≈1.4 octaves
    private let eqBWs: [Float]    = [1.5, 1.4, 1.4, 1.4, 1.5]

    init() {
        eqNode    = AVAudioUnitEQ(numberOfBands: 5)
        notchNode = AVAudioUnitEQ(numberOfBands: 1)
        boostNode = AVAudioUnitEQ(numberOfBands: 1)
        fadeMixer = AVAudioMixerNode()
        masterMixer = AVAudioMixerNode()

        // Configure 5-band parametric EQ
        for i in 0..<5 {
            let b = eqNode.bands[i]
            b.filterType = .parametric
            b.frequency  = eqFreqs[i]
            b.bandwidth  = eqBWs[i]
            b.gain       = 0
            b.bypass     = false
        }

        // Notch (inactive by default at 22050 Hz, 0 dB gain)
        let nb = notchNode.bands[0]
        nb.filterType = .parametric
        nb.frequency  = 22050
        nb.bandwidth  = 0.05   // Q≈30
        nb.gain       = 0
        nb.bypass     = false

        // Boost (inactive by default)
        let bb = boostNode.bands[0]
        bb.filterType = .parametric
        bb.frequency  = 22050
        bb.bandwidth  = 0.05
        bb.gain       = 0
        bb.bypass     = false

        // Chain: masterMixer → eq → notch → boost → fadeMixer → engine output
        engine.attach(masterMixer)
        engine.attach(eqNode)
        engine.attach(notchNode)
        engine.attach(boostNode)
        engine.attach(fadeMixer)

        engine.connect(masterMixer, to: eqNode,    format: nil)
        engine.connect(eqNode,      to: notchNode, format: nil)
        engine.connect(notchNode,   to: boostNode, format: nil)
        engine.connect(boostNode,   to: fadeMixer, format: nil)
        engine.connect(fadeMixer,   to: engine.mainMixerNode, format: nil)
    }

    // MARK: — Engine lifecycle

    func ensureRunning() {
        guard !isRunning else { return }
        do {
            try engine.start()
            isRunning = true
        } catch {
            print("[AudioGraph] engine start failed: \(error)")
        }
    }

    func stopEngine() {
        engine.stop()
        isRunning = false
    }

    // MARK: — Track management

    func getOrCreateTrackEngine(id: String, filePath: String) -> TrackEngine {
        if let existing = trackEngines[id] { return existing }
        let te = TrackEngine(trackId: id, filePath: filePath,
                             audioEngine: engine, outputNode: masterMixer)
        trackEngines[id] = te
        return te
    }

    func removeTrackEngine(id: String) {
        trackEngines[id]?.stop()
        trackEngines.removeValue(forKey: id)
    }

    func stopAll() {
        for te in trackEngines.values { te.stop() }
        cancelFadeOut()
    }

    // MARK: — Global controls

    func setEq(gains: [Float]) {
        for i in 0..<min(5, gains.count) {
            eqNode.bands[i].gain = gains[i]
        }
    }

    func setNotch(freq: Float?) {
        let b = notchNode.bands[0]
        if let f = freq {
            b.frequency = f
            b.gain      = -60
        } else {
            b.frequency = 22050
            b.gain      = 0
        }
    }

    func setBoost(freq: Float?) {
        let b = boostNode.bands[0]
        if let f = freq {
            b.frequency = f
            b.gain      = 12
        } else {
            b.frequency = 22050
            b.gain      = 0
        }
    }

    func setMasterVolume(_ vol: Float) {
        masterMixer.outputVolume = vol
    }

    // MARK: — Fade out / cancel

    func startFadeOut(durationSeconds: Double) {
        cancelFadeOut()
        let startGain = Double(fadeMixer.outputVolume)
        let steps = max(Int(durationSeconds * 60), 1)
        var currentStep = 0

        fadeOutTimer = Timer.scheduledTimer(withTimeInterval: 1.0/60.0, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            currentStep += 1
            let t = Double(currentStep) / Double(steps)
            self.fadeMixer.outputVolume = Float(max(0.0, startGain * (1.0 - t)))
            if currentStep >= steps {
                timer.invalidate()
                self.fadeMixer.outputVolume = 0
            }
        }
    }

    func cancelFadeOut() {
        fadeOutTimer?.invalidate()
        fadeOutTimer = nil
        fadeMixer.outputVolume = 1.0
    }

    // MARK: — Status snapshot

    func buildStatus() -> [String: [String: Any]] {
        var dict: [String: [String: Any]] = [:]
        for (id, te) in trackEngines {
            dict[id] = [
                "isPlaying": te.isPlaying,
                "isLoading": false,
                "hasError": false,
                "volume": te.volume
            ]
        }
        return dict
    }
}
