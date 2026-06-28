import AVFoundation

// ═════════════════════════════════════════════════════════════════════════════
// TrackEngine — one per sound track, manages ping-pong AVAudioPlayerNode
// crossfade for seamless looping.  Uses scheduleSegment for precise region
// playback with per-node volume envelopes.
// ══════════════════════════════════════════════════════════════════════════════
class TrackEngine {
    let trackId: String
    let filePath: String

    private let engine: AVAudioEngine
    private let outputNode: AVAudioNode
    private let trackMixer: AVAudioMixerNode

    // Ping-pong nodes
    private var nodeA: AVAudioPlayerNode?
    private var nodeB: AVAudioPlayerNode?
    private var currentIsA = true

    // Buffer loaded from the app bundle
    private var audioFile: AVAudioFile?
    private var buffer: AVAudioPCMBuffer?

    private var isLoaded = false
    private var isStopped = false

    // Loop region (seconds)
    var loopStart: Double = 0
    var loopEnd: Double? = nil
    var crossfadeDuration: Double = 15

    // Track-level volume (0–1)
    var volume: Float = 0.5 {
        didSet { trackMixer.outputVolume = volume }
    }

    private var fadeTimer: Timer?
    private var scheduleTimer: Timer?

    var isPlaying: Bool {
        return nodeA?.isPlaying == true || nodeB?.isPlaying == true
    }

    init(trackId: String, filePath: String, audioEngine: AVAudioEngine, outputNode: AVAudioNode) {
        self.trackId    = trackId
        self.filePath   = filePath
        self.engine     = audioEngine
        self.outputNode = outputNode

        trackMixer = AVAudioMixerNode()
        trackMixer.outputVolume = volume
        engine.attach(trackMixer)
        engine.connect(trackMixer, to: outputNode, format: nil)
    }

    // MARK: — Load

    func load() throws {
        guard !isLoaded else { return }
        // filePath may contain a subdirectory prefix, e.g. "sounds/ocean-HighTideBeach.mp3"
        let components = filePath.split(separator: "/")
        let dir  = components.count > 1 ? components.dropLast().joined(separator: "/") : nil
        let name = String(components.last!)
        let ext  = (name as NSString).pathExtension
        let base = (name as NSString).deletingPathExtension

        guard let path = Bundle.main.path(forResource: base, ofType: ext, inDirectory: dir),
              let url = URL(string: path) ?? URL(fileURLWithPath: path) else {
            throw NSError(domain: "TrackEngine", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "File not found: \(filePath)"])
        }
        let file = try AVAudioFile(forReading: url)
        audioFile = file
        let format = file.processingFormat
        let frameCount = AVAudioFrameCount(file.length)
        guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            throw NSError(domain: "TrackEngine", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Failed to allocate buffer"])
        }
        try file.read(into: buf)
        buffer = buf
        isLoaded = true
    }

    // MARK: — Playback

    func play(fadeIn: Double = 1.5) {
        guard isLoaded, let buf = buffer else { return }
        stop(false)
        isStopped = false

        let regionDuration = effectiveRegionDuration()
        let xfade = effectiveXfade()

        nodeA = AVAudioPlayerNode()
        engine.attach(nodeA!)
        engine.connect(nodeA!, to: trackMixer, format: buf.format)
        nodeA!.volume = 1.0

        // Start playback with region
        let startFrame = AVAudioFramePosition(loopStart * buf.format.sampleRate)
        let endFrame   = loopEnd != nil
            ? AVAudioFramePosition(loopEnd! * buf.format.sampleRate)
            : AVAudioFramePosition(buf.frameLength)
        let regionFrames = endFrame - startFrame

        nodeA!.scheduleSegment(audioFile!, startingFrame: startFrame,
                               frameCount: AVAudioFrameCount(regionFrames),
                               at: nil, completionHandler: nil)
        nodeA!.play()
        currentIsA = true

        // Fade in track mixer from 0 → volume
        trackMixer.outputVolume = 0
        rampMixer(to: volume, duration: fadeIn)

        // Schedule next loop crossfade
        let nextTime = regionDuration - xfade
        if nextTime > 0 {
            scheduleTimer = Timer.scheduledTimer(withTimeInterval: nextTime,
                                               repeats: false) { [weak self] _ in
                self?.scheduleCrossfade()
            }
        }
    }

    // MARK: — Ping-pong crossfade

    private func scheduleCrossfade() {
        guard !isStopped, isLoaded, let buf = buffer else { return }
        let xfade = effectiveXfade()
        let regionDuration = effectiveRegionDuration()

        let outNode = currentIsA ? nodeA : nodeB
        let inNode  = currentIsA ? nodeB : nodeA
        currentIsA.toggle()

        // Create fresh node if needed
        if inNode == nil {
            let fresh = AVAudioPlayerNode()
            engine.attach(fresh)
            engine.connect(fresh, to: trackMixer, format: buf.format)
            if currentIsA { nodeA = fresh } else { nodeB = fresh }
        }
        let activeIn = currentIsA ? nodeA! : nodeB!

        let startFrame = AVAudioFramePosition(loopStart * buf.format.sampleRate)
        let endFrame   = loopEnd != nil
            ? AVAudioFramePosition(loopEnd! * buf.format.sampleRate)
            : AVAudioFramePosition(buf.frameLength)
        let regionFrames = endFrame - startFrame

        // Schedule the incoming segment
        activeIn.scheduleSegment(audioFile!, startingFrame: startFrame,
                                 frameCount: AVAudioFrameCount(regionFrames),
                                 at: nil, completionHandler: nil)
        activeIn.volume = 0
        activeIn.play()

        // Animate volume envelopes over xfade seconds
        let steps = max(Int(xfade * 60), 1)
        var step = 0
        Timer.scheduledTimer(withTimeInterval: 1.0/60.0, repeats: true) { [weak self, weak outNode] timer in
            guard let self = self else { timer.invalidate(); return }
            step += 1
            let t = Float(step) / Float(steps)
            // Equal-power curves (sine/cosine)
            let inVol  = sin(t * .pi / 2)
            let outVol = cos(t * .pi / 2)
            activeIn.volume  = inVol
            outNode?.volume   = outVol
            if step >= steps {
                timer.invalidate()
                outNode?.stop()
            }
        }

        // Schedule next loop
        let nextTime = regionDuration - xfade
        if nextTime > 0 {
            scheduleTimer = Timer.scheduledTimer(withTimeInterval: nextTime,
                                               repeats: false) { [weak self] _ in
                self?.scheduleCrossfade()
            }
        }
    }

    // MARK: — Stop / Pause

    func stop(_ immediate: Bool = false) {
        isStopped = true
        fadeTimer?.invalidate()
        fadeTimer = nil
        scheduleTimer?.invalidate()
        scheduleTimer = nil

        if immediate {
            nodeA?.stop()
            nodeB?.stop()
            nodeA = nil; nodeB = nil
            trackMixer.outputVolume = 0
            return
        }

        // Gentle ramp to silence then stop
        let fromVol = trackMixer.outputVolume
        if fromVol > 0.001 {
            let duration = 0.75
            let steps = max(Int(duration * 60), 1)
            var step = 0
            fadeTimer = Timer.scheduledTimer(withTimeInterval: 1.0/60.0, repeats: true) { [weak self] timer in
                guard let self = self else { timer.invalidate(); return }
                step += 1
                let t = Float(step) / Float(steps)
                self.trackMixer.outputVolume = fromVol * (1.0 - t)
                if step >= steps {
                    timer.invalidate()
                    self.nodeA?.stop()
                    self.nodeB?.stop()
                    self.nodeA = nil; self.nodeB = nil
                    self.trackMixer.outputVolume = 0
                }
            }
        } else {
            nodeA?.stop(); nodeB?.stop()
            nodeA = nil; nodeB = nil
            trackMixer.outputVolume = 0
        }
    }

    // MARK: — Helpers

    private func effectiveRegionDuration() -> Double {
        guard let buf = buffer else { return 1 }
        let total = Double(buf.frameLength) / buf.format.sampleRate
        let end = loopEnd ?? total
        return max(end - loopStart, 0.1)
    }

    private func effectiveXfade() -> Double {
        let region = effectiveRegionDuration()
        return min(crossfadeDuration, region / 3.0)
    }

    private func rampMixer(to target: Float, duration: Double) {
        fadeTimer?.invalidate()
        let start = trackMixer.outputVolume
        let steps = max(Int(duration * 60), 1)
        var step = 0
        fadeTimer = Timer.scheduledTimer(withTimeInterval: 1.0/60.0, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            step += 1
            let t = Float(step) / Float(steps)
            self.trackMixer.outputVolume = start + (target - start) * t
            if step >= steps {
                timer.invalidate()
                self.trackMixer.outputVolume = target
            }
        }
    }
}
