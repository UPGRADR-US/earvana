import Foundation

/// Process-owned observer. Never calls playback controls or schedules audio.
final class PlaybackUsage {
    static let shared = PlaybackUsage()
    private struct Window { var track: String; var last: Double; var end: Double; var suspended: Bool }
    private let lock = NSLock()
    private var windows: [UUID: Window] = [:]
    private var totals: [String: Double] = [:]
    private var interrupted = false
    private var now: Double { ProcessInfo.processInfo.systemUptime }
    private func settle(_ time: Double) {
        var elapsed: [String: Double] = [:]
        for (id, value) in windows {
            var window = value
            if !window.suspended {
                elapsed[window.track] = max(elapsed[window.track, default: 0], max(0, min(time, window.end) - window.last))
            }
            window.last = time
            if time >= window.end { windows.removeValue(forKey: id) }
            else { windows[id] = window }
        }
        for (track, seconds) in elapsed { totals[track, default: 0] += seconds }
    }
    func begin(_ id: UUID, track: String) {
        lock.lock(); defer { lock.unlock() }
        let time = now; settle(time)
        totals[track, default: 0] += 0
        windows[id] = Window(track: track, last: time, end: .infinity, suspended: interrupted)
    }
    func tail(_ id: UUID, seconds: Double) {
        lock.lock(); defer { lock.unlock() }
        let time = now; settle(time)
        if var window = windows[id] {
            window.end = min(window.end, time + max(0, seconds)); windows[id] = window
        }
    }
    func end(_ id: UUID) {
        lock.lock(); defer { lock.unlock() }
        settle(now); windows.removeValue(forKey: id)
    }
    func interrupt() {
        lock.lock(); defer { lock.unlock() }
        settle(now); interrupted = true
        for id in Array(windows.keys) { windows[id]?.suspended = true }
    }
    func interruptionEnded() {
        lock.lock(); defer { lock.unlock() }; interrupted = false
    }
    func resume(_ id: UUID) {
        lock.lock(); defer { lock.unlock() }
        settle(now); windows[id]?.suspended = interrupted
    }
    func snapshot() -> [String: Double] {
        lock.lock(); defer { lock.unlock() }; settle(now); return totals
    }
}
