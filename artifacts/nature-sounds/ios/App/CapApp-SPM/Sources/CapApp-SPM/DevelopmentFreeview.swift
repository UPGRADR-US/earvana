import Foundation

/// Main-thread development policy. State lasts for this app process, OFF by default.
final class DevelopmentFreeview {
    static let shared = DevelopmentFreeview()
    static let fadeSeconds: Double = 1.000
    static func envelopeLevel(elapsed: Double, initial: Float = 1) -> Float {
        initial * Float(max(0, min(1, 1 - elapsed / fadeSeconds)))
    }
    private(set) var enabled = false
    private(set) var exhausted: Set<String> = []
    var subscribed: () -> Bool = { false }
    private var timer: Timer?
    private var observers: [UUID: (Bool, Bool) -> Void] = [:]
    var available: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }
    func configure(_ requested: Bool) {
        enabled = available && requested
        timer?.invalidate(); timer = nil
        if enabled {
            let timer = Timer(timeInterval: 0.02, repeats: true) { [weak self] _ in self?.tick() }
            self.timer = timer; RunLoop.main.add(timer, forMode: .common)
        }
        tick()
    }
    func reject(_ track: String) -> Bool {
        guard enabled, !subscribed() else { return false }
        if PlaybackUsage.shared.snapshot()[track, default: 0] >= 60 { exhausted.insert(track) }
        return exhausted.contains(track)
    }
    func observe(_ id: UUID, callback: @escaping (Bool, Bool) -> Void) { observers[id] = callback }
    func remove(_ id: UUID) { observers.removeValue(forKey: id) }
    func tick() {
        let bypass = !enabled || subscribed()
        if !bypass {
            for (track, seconds) in PlaybackUsage.shared.snapshot() where seconds >= 60 { exhausted.insert(track) }
        }
        for callback in Array(observers.values) { callback(enabled, bypass) }
    }
}
