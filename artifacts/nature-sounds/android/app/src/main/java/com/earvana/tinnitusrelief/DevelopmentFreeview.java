package com.earvana.tinnitusrelief;

import java.util.HashSet;
import java.util.Set;

/** Process-owned development policy. No sound-specific exceptions. */
final class DevelopmentFreeview {
    static final long FADE_MILLISECONDS = 1000;
    static float envelopeLevel(double elapsedSeconds) {
        return (float) Math.max(0, Math.min(1, 1.0 - elapsedSeconds / (FADE_MILLISECONDS / 1000.0)));
    }
    private static boolean enabled;
    private static final Set<String> exhausted = new HashSet<>();
    static synchronized void configure(boolean debugBuild, boolean requested) { enabled = debugBuild && requested; }
    static synchronized boolean enabled() { return enabled; }
    static synchronized boolean reject(String track, boolean subscribed) {
        if (!enabled || subscribed || track == null) return false;
        if (PlaybackUsage.snapshot().getOrDefault(track, 0.0) >= 60.0) exhausted.add(track);
        return exhausted.contains(track);
    }
    static synchronized void refresh(boolean subscribed) {
        if (enabled && !subscribed) PlaybackUsage.snapshot().forEach((track, seconds) -> {
            if (seconds >= 60.0) exhausted.add(track);
        });
    }
    static synchronized String[] exhausted() { return exhausted.toArray(new String[0]); }
}
