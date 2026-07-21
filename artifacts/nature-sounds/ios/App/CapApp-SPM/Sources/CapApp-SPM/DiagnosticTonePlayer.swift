import AVFoundation

/// Sine-wave test tone for the diagnostics frequency matcher.
/// Uses a dedicated AVAudioEngine so tones work while WKWebView Web Audio is silent on iOS.
final class DiagnosticTonePlayer {
    private var engine: AVAudioEngine?
    private var sourceNode: AVAudioSourceNode?
    private var sampleRate: Double = 44100
    private var frequency: Double = 1000
    private var gain: Float = 0.12
    private var phase: Double = 0
    private let stateLock = NSLock()

    func play(frequency: Double, gain: Float) throws {
        stop()

        self.frequency = frequency
        self.gain = gain
        phase = 0

        let eng = AVAudioEngine()
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        let sr = sampleRate

        let src = AVAudioSourceNode(format: format) { [weak self] isSilence, _, frameCount, outputData -> OSStatus in
            guard let self = self else {
                isSilence.pointee = true
                return noErr
            }

            let abl = UnsafeMutableAudioBufferListPointer(outputData)
            guard let buffer = abl.first, let ptr = buffer.mData?.assumingMemoryBound(to: Float.self) else {
                isSilence.pointee = true
                return noErr
            }

            self.stateLock.lock()
            let freq = self.frequency
            let amp = self.gain
            var p = self.phase
            self.stateLock.unlock()

            let phaseInc = 2.0 * Double.pi * freq / sr
            let frames = Int(frameCount)
            for i in 0..<frames {
                ptr[i] = Float(sin(p)) * amp
                p += phaseInc
            }

            self.stateLock.lock()
            self.phase = p.truncatingRemainder(dividingBy: 2.0 * Double.pi)
            self.stateLock.unlock()

            isSilence.pointee = false
            return noErr
        }

        eng.attach(src)
        eng.connect(src, to: eng.mainMixerNode, format: format)
        try eng.start()

        engine = eng
        sourceNode = src
    }

    func setGain(_ gain: Float) {
        stateLock.lock()
        self.gain = gain
        stateLock.unlock()
    }

    func stop() {
        if let eng = engine, let src = sourceNode {
            eng.stop()
            eng.detach(src)
        }
        engine = nil
        sourceNode = nil
        phase = 0
    }
}