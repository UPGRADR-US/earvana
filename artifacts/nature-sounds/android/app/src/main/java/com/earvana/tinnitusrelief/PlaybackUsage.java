package com.earvana.tinnitusrelief;

import java.util.HashMap;
import java.util.Map;

/** Process-owned monotonic observer; no audio controls or timers. */
final class PlaybackUsage {
    private static final Map<Object, Window> windows = new HashMap<>();
    private static final Map<String, Double> totals = new HashMap<>();
    private static final class Window {
        String track; double last, end = Double.POSITIVE_INFINITY; boolean suspended, interrupted;
        Window(String track, double time) { this.track = track; last = time; }
    }
    private static double now() { return System.nanoTime() / 1e9; }
    private static void settle(double time) {
        Map<String, Double> elapsed = new HashMap<>();
        windows.entrySet().removeIf(entry -> {
            Window w = entry.getValue();
            if (!w.suspended && !w.interrupted) elapsed.merge(w.track, Math.max(0, Math.min(time, w.end) - w.last), Math::max);
            w.last = time;
            return time >= w.end;
        });
        elapsed.forEach((track, seconds) -> totals.merge(track, seconds, Double::sum));
    }
    static synchronized void begin(Object id, String track) {
        double time = now(); settle(time); totals.putIfAbsent(track, 0.0);
        windows.put(id, new Window(track, time));
    }
    static synchronized void tail(Object id, double seconds) {
        double time = now(); settle(time); Window w = windows.get(id);
        if (w != null) w.end = Math.min(w.end, time + Math.max(0, seconds));
    }
    static synchronized void end(Object id) { settle(now()); windows.remove(id); }
    static synchronized void suspend(Object id, boolean suspended) {
        settle(now()); Window w = windows.get(id); if (w != null) w.suspended = suspended;
    }
    static synchronized void interrupt() {
        settle(now()); for (Window w : windows.values()) w.interrupted = true;
    }
    static synchronized Map<String, Double> snapshot() { settle(now()); return new HashMap<>(totals); }
}
