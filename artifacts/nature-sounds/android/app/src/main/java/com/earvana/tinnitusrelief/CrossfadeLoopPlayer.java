package com.earvana.tinnitusrelief;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.audiofx.DynamicsProcessing;
import android.media.audiofx.Equalizer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;

/**
 * Android port of iOS CrossfadeLoopPlayer.
 * Streams MP3 via dual MediaPlayers (no full-file PCM decode) with equal-power
 * volume crossfades, fade in/out, EQ, and optional notch/boost therapy.
 */
public class CrossfadeLoopPlayer {
    private static final String TAG = "CrossfadeLoopPlayer";
    private static final float[] EQ_FREQS = {100f, 330f, 1000f, 3300f, 10000f};

    private final Context appContext;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private MediaPlayer playerA;
    private MediaPlayer playerB;
    private File sourceFile;
    private String sourcePath; // absolute path used by MediaPlayers

    private double loopStart = 0;
    private double loopEnd = 0;
    private double regionDuration = 0;
    private double crossfadeDuration = 15;

    private int currentSlot = 0;
    private volatile boolean playing = false;
    private volatile boolean released = false;

    private float trackVolume = 0.5f;
    private float masterVolume = 0.8f;
    private float fadeMultiplier = 1.0f;
    private float timerFadeLevel = 1.0f;

    private float[] eqGains = new float[]{0, 0, 0, 0, 0};
    private Float notchFreq = null;
    private Float boostFreq = null;

    private Equalizer equalizer;
    private DynamicsProcessing dynamics;

    private Runnable crossfadeRunnable;
    private Runnable fadeRunnable;
    private Runnable timerFadeRunnable;
    private Runnable stopAfterFadeRunnable;

    public CrossfadeLoopPlayer(Context context) {
        this.appContext = context.getApplicationContext();
    }

    private float outputLevel() {
        return Math.max(0f, Math.min(1f, trackVolume * masterVolume * fadeMultiplier * timerFadeLevel));
    }

    private MediaPlayer activePlayer() {
        return currentSlot == 0 ? playerA : playerB;
    }

    private MediaPlayer idlePlayer() {
        return currentSlot == 0 ? playerB : playerA;
    }

    private double effectiveXfade() {
        if (regionDuration <= 0) return 0.05;
        return Math.min(crossfadeDuration, regionDuration / 3.0);
    }

    /**
     * Prepare and start playback. Runs prepare on a background thread; starts on main.
     * @param onReady called on main when audio is actually audible (or on failure)
     */
    public void play(
            String assetOrFilePath,
            float loopStartSec,
            Float loopEndSec,
            float crossfadeSec,
            float volume,
            float master,
            boolean skipFadeIn,
            float[] gains,
            Float notch,
            Float boost,
            Runnable onReady,
            Runnable onError
    ) {
        stopImmediate();
        released = false;
        playing = false;

        trackVolume = volume;
        masterVolume = master;
        fadeMultiplier = skipFadeIn ? 1f : 0f;
        timerFadeLevel = 1f;
        if (gains != null) {
            for (int i = 0; i < 5 && i < gains.length; i++) eqGains[i] = gains[i];
        }
        notchFreq = notch;
        boostFreq = boost;
        crossfadeDuration = crossfadeSec;

        new Thread(() -> {
            try {
                File file = ensureLocalFile(assetOrFilePath);
                if (released) return;

                sourceFile = file;
                sourcePath = file.getAbsolutePath();

                // Prepare both players off the main thread (local file — usually fast)
                MediaPlayer a = createPlayer();
                MediaPlayer b = createPlayer();
                a.prepare();
                if (released) {
                    releasePlayer(a);
                    releasePlayer(b);
                    return;
                }
                b.prepare();
                if (released) {
                    releasePlayer(a);
                    releasePlayer(b);
                    return;
                }

                int durationMs = a.getDuration();
                double fileDuration = Math.max(0.1, durationMs / 1000.0);
                loopStart = Math.max(0, loopStartSec);
                loopEnd = (loopEndSec != null && loopEndSec > loopStart && loopEndSec <= fileDuration)
                        ? loopEndSec : fileDuration;
                if (loopEnd <= loopStart) loopEnd = fileDuration;
                regionDuration = loopEnd - loopStart;

                seekToLoopStart(a);
                seekToLoopStart(b);

                mainHandler.post(() -> {
                    if (released) {
                        releasePlayer(a);
                        releasePlayer(b);
                        return;
                    }
                    try {
                        playerA = a;
                        playerB = b;
                        applyEffects(playerA.getAudioSessionId());

                        currentSlot = 0;
                        playerA.setVolume(1f, 1f);
                        playerB.setVolume(0f, 0f);

                        playing = true;
                        playerA.start();
                        applyOutputVolumeToActive();

                        if (!skipFadeIn) {
                            rampFadeMultiplier(1f, 1.5f, null);
                        } else {
                            fadeMultiplier = 1f;
                            applyOutputVolumeToActive();
                        }
                        queueNextCrossfade();
                        Log.d(TAG, "Playing " + sourcePath + " region=" + regionDuration
                                + "s xfade=" + effectiveXfade() + "s");
                        if (onReady != null) onReady.run();
                    } catch (Exception e) {
                        Log.e(TAG, "start failed", e);
                        releasePlayer(a);
                        releasePlayer(b);
                        playerA = null;
                        playerB = null;
                        if (onError != null) onError.run();
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "play prepare failed: " + assetOrFilePath, e);
                mainHandler.post(() -> {
                    if (onError != null) onError.run();
                });
            }
        }, "Crossfade-Prepare").start();
    }

    private MediaPlayer createPlayer() throws IOException {
        MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
        mp.setDataSource(sourcePath);
        mp.setLooping(false);
        return mp;
    }

    private void seekToLoopStart(MediaPlayer mp) {
        try {
            int ms = (int) Math.round(loopStart * 1000.0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mp.seekTo(ms, MediaPlayer.SEEK_CLOSEST);
            } else {
                mp.seekTo(ms);
            }
        } catch (Exception e) {
            Log.w(TAG, "seek failed", e);
        }
    }

    private void queueNextCrossfade() {
        cancelCrossfade();
        if (!playing) return;
        double xfade = effectiveXfade();
        double delay = Math.max(0.05, regionDuration - xfade);
        crossfadeRunnable = () -> {
            if (!playing || released) return;
            performCrossfade();
        };
        mainHandler.postDelayed(crossfadeRunnable, (long) (delay * 1000));
    }

    private void performCrossfade() {
        if (!playing || released) return;
        MediaPlayer out = activePlayer();
        MediaPlayer in = idlePlayer();
        if (out == null || in == null) return;

        try {
            if (in.isPlaying()) in.pause();
            seekToLoopStart(in);
            in.setVolume(0f, 0f);
            in.start();
        } catch (Exception e) {
            Log.e(TAG, "crossfade restart failed", e);
            // Fallback: simple loop on active player
            try {
                seekToLoopStart(out);
                if (!out.isPlaying()) out.start();
                queueNextCrossfade();
            } catch (Exception ignored) {}
            return;
        }

        double xfade = effectiveXfade();
        animateEqualPowerCrossfade(out, in, xfade, () -> {
            try {
                if (out.isPlaying()) out.pause();
                out.setVolume(0f, 0f);
            } catch (Exception ignored) {}
        });
        currentSlot = 1 - currentSlot;
        queueNextCrossfade();
    }

    private void animateEqualPowerCrossfade(MediaPlayer out, MediaPlayer in, double durationSec, Runnable onDone) {
        cancelFadeAnimOnly();
        final long start = android.os.SystemClock.uptimeMillis();
        final long durationMs = Math.max(50, (long) (durationSec * 1000));
        final float base = outputLevel();

        fadeRunnable = new Runnable() {
            @Override
            public void run() {
                if (!playing || released) return;
                long elapsed = android.os.SystemClock.uptimeMillis() - start;
                float t = Math.min(1f, elapsed / (float) durationMs);
                // equal power
                float outV = (float) Math.sin((1.0 - t) * Math.PI / 2.0) * base;
                float inV = (float) Math.sin(t * Math.PI / 2.0) * base;
                try {
                    out.setVolume(outV, outV);
                    in.setVolume(inV, inV);
                } catch (Exception ignored) {}
                if (t >= 1f) {
                    try {
                        in.setVolume(base, base);
                        out.setVolume(0f, 0f);
                    } catch (Exception ignored) {}
                    if (onDone != null) onDone.run();
                    fadeRunnable = null;
                } else {
                    mainHandler.postDelayed(this, 33);
                }
            }
        };
        mainHandler.post(fadeRunnable);
    }

    private void applyOutputVolumeToActive() {
        float lvl = outputLevel();
        MediaPlayer active = activePlayer();
        MediaPlayer idle = idlePlayer();
        try {
            if (active != null) active.setVolume(lvl, lvl);
            // keep idle silent unless mid-crossfade (crossfade anim owns volumes)
            if (idle != null && (fadeRunnable == null)) idle.setVolume(0f, 0f);
        } catch (Exception ignored) {}
    }

    private void rampFadeMultiplier(float target, float durationSec, Runnable onDone) {
        cancelNamed(fadeRunnable);
        final float start = fadeMultiplier;
        final long startMs = android.os.SystemClock.uptimeMillis();
        final long durationMs = Math.max(40, (long) (durationSec * 1000));

        fadeRunnable = new Runnable() {
            @Override
            public void run() {
                if (released) return;
                long elapsed = android.os.SystemClock.uptimeMillis() - startMs;
                float t = Math.min(1f, elapsed / (float) durationMs);
                fadeMultiplier = start + (target - start) * t;
                applyOutputVolumeToActive();
                if (t >= 1f) {
                    fadeMultiplier = target;
                    applyOutputVolumeToActive();
                    fadeRunnable = null;
                    if (onDone != null) onDone.run();
                } else {
                    mainHandler.postDelayed(this, 40);
                }
            }
        };
        mainHandler.post(fadeRunnable);
    }

    public void pause(float fadeSeconds, Runnable onFinished) {
        if (!playing) {
            stopImmediate();
            if (onFinished != null) mainHandler.post(onFinished);
            return;
        }
        playing = false;
        cancelCrossfade();
        cancelNamed(timerFadeRunnable);

        if (fadeSeconds <= 0) {
            stopImmediate();
            if (onFinished != null) onFinished.run();
            return;
        }

        // Cap fade so stop never feels stuck (iOS uses 0.75s)
        float fade = Math.min(0.75f, fadeSeconds);
        rampFadeMultiplier(0f, fade, () -> {
            stopImmediate();
            if (onFinished != null) onFinished.run();
        });
    }

    /** Instant halt — used when switching tracks or force-stop. */
    public void stopImmediate() {
        released = true;
        playing = false;
        cancelCrossfade();
        cancelNamed(fadeRunnable);
        cancelNamed(timerFadeRunnable);
        cancelNamed(stopAfterFadeRunnable);
        fadeRunnable = null;
        timerFadeRunnable = null;
        stopAfterFadeRunnable = null;

        releasePlayer(playerA);
        releasePlayer(playerB);
        playerA = null;
        playerB = null;
        releaseEffects();
        fadeMultiplier = 1f;
        timerFadeLevel = 1f;
    }

    private void releasePlayer(MediaPlayer mp) {
        if (mp == null) return;
        try {
            mp.setOnCompletionListener(null);
            mp.setOnErrorListener(null);
            if (mp.isPlaying()) mp.stop();
        } catch (Exception ignored) {}
        try {
            mp.reset();
        } catch (Exception ignored) {}
        try {
            mp.release();
        } catch (Exception ignored) {}
    }

    public void setVolume(float volume) {
        trackVolume = volume;
        applyOutputVolumeToActive();
    }

    public void setMasterVolume(float volume) {
        masterVolume = volume;
        applyOutputVolumeToActive();
    }

    public void setEq(float[] gains) {
        if (gains == null) return;
        for (int i = 0; i < 5 && i < gains.length; i++) eqGains[i] = gains[i];
        applyEqToEffects();
    }

    public void setNotch(Float freq) {
        notchFreq = freq;
        if (freq != null) boostFreq = null;
        applyEqToEffects();
    }

    public void setBoost(Float freq) {
        boostFreq = freq;
        if (freq != null) notchFreq = null;
        applyEqToEffects();
    }

    public void startFadeOut(float durationSeconds) {
        cancelNamed(timerFadeRunnable);
        final float start = timerFadeLevel;
        final float target = 0.0001f;
        final long startMs = android.os.SystemClock.uptimeMillis();
        final long durationMs = Math.max(40, (long) (durationSeconds * 1000));
        timerFadeRunnable = new Runnable() {
            @Override
            public void run() {
                if (!playing || released) return;
                long elapsed = android.os.SystemClock.uptimeMillis() - startMs;
                float t = Math.min(1f, elapsed / (float) durationMs);
                timerFadeLevel = start + (target - start) * t;
                applyOutputVolumeToActive();
                if (t >= 1f) {
                    timerFadeLevel = target;
                    applyOutputVolumeToActive();
                    timerFadeRunnable = null;
                } else {
                    mainHandler.postDelayed(this, 40);
                }
            }
        };
        mainHandler.post(timerFadeRunnable);
    }

    public void cancelFade() {
        cancelNamed(timerFadeRunnable);
        timerFadeRunnable = null;
        timerFadeLevel = 1f;
        applyOutputVolumeToActive();
    }

    public boolean isPlaying() {
        return playing;
    }

    // ─── Effects ────────────────────────────────────────────────────────────

    private void applyEffects(int audioSessionId) {
        releaseEffects();
        if (audioSessionId == 0) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                // 5 parametric-ish bands + room for therapy peak
                DynamicsProcessing.Config.Builder cfg = new DynamicsProcessing.Config.Builder(
                        0 /*variant*/,
                        1 /*channels*/,
                        true, 5,  // preEq
                        true, 5,  // mbc
                        true, 5,  // postEq
                        true      // limiter
                );
                dynamics = new DynamicsProcessing(0, audioSessionId, cfg.build());
                dynamics.setEnabled(true);
                applyEqToEffects();
                return;
            } catch (Throwable t) {
                Log.w(TAG, "DynamicsProcessing unavailable, falling back to Equalizer", t);
                dynamics = null;
            }
        }

        try {
            equalizer = new Equalizer(0, audioSessionId);
            equalizer.setEnabled(true);
            applyEqToEffects();
        } catch (Throwable t) {
            Log.w(TAG, "Equalizer unavailable", t);
            equalizer = null;
        }
    }

    private void applyEqToEffects() {
        if (dynamics != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                for (int i = 0; i < 5; i++) {
                    DynamicsProcessing.EqBand band = new DynamicsProcessing.EqBand(
                            true, EQ_FREQS[i], eqGains[i]);
                    dynamics.setPreEqBandAllChannelsTo(i, band);
                    dynamics.setPostEqBandAllChannelsTo(i, band);
                }
                // Use band 0 post as therapy if notch/boost — coarse but works on more OEMs
                // Prefer dedicated gain on nearest band
                if (notchFreq != null) {
                    int idx = nearestBand(notchFreq);
                    DynamicsProcessing.EqBand cut = new DynamicsProcessing.EqBand(
                            true, notchFreq, -24f);
                    dynamics.setPostEqBandAllChannelsTo(idx, cut);
                } else if (boostFreq != null) {
                    int idx = nearestBand(boostFreq);
                    DynamicsProcessing.EqBand boost = new DynamicsProcessing.EqBand(
                            true, boostFreq, 12f);
                    dynamics.setPostEqBandAllChannelsTo(idx, boost);
                }
            } catch (Throwable t) {
                Log.w(TAG, "apply DynamicsProcessing EQ failed", t);
            }
            return;
        }

        if (equalizer != null) {
            try {
                short bands = equalizer.getNumberOfBands();
                short[] range = equalizer.getBandLevelRange(); // milliBel
                for (short b = 0; b < bands; b++) {
                    int center = equalizer.getCenterFreq(b) / 1000; // mHz → Hz
                    float gainDb = 0f;
                    // map nearest of our 5 gains
                    int nearest = 0;
                    float best = Float.MAX_VALUE;
                    for (int i = 0; i < 5; i++) {
                        float d = Math.abs(EQ_FREQS[i] - center);
                        if (d < best) { best = d; nearest = i; }
                    }
                    gainDb = eqGains[nearest];
                    if (notchFreq != null && Math.abs(center - notchFreq) < Math.abs(center - EQ_FREQS[nearest])) {
                        // rough notch on closest system band
                        if (Math.abs(center - notchFreq) < center * 0.5f) gainDb = -12f;
                    } else if (boostFreq != null && Math.abs(center - boostFreq) < center * 0.35f) {
                        gainDb = 12f;
                    }
                    short level = (short) Math.max(range[0], Math.min(range[1], (int) (gainDb * 100)));
                    equalizer.setBandLevel(b, level);
                }
            } catch (Throwable t) {
                Log.w(TAG, "apply Equalizer failed", t);
            }
        }
    }

    private int nearestBand(float freq) {
        int nearest = 0;
        float best = Float.MAX_VALUE;
        for (int i = 0; i < 5; i++) {
            float d = Math.abs(EQ_FREQS[i] - freq);
            if (d < best) { best = d; nearest = i; }
        }
        return nearest;
    }

    private void releaseEffects() {
        if (dynamics != null) {
            try { dynamics.release(); } catch (Exception ignored) {}
            dynamics = null;
        }
        if (equalizer != null) {
            try { equalizer.release(); } catch (Exception ignored) {}
            equalizer = null;
        }
    }

    // ─── Asset / file helpers ───────────────────────────────────────────────

    private File ensureLocalFile(String path) throws IOException {
        // Absolute existing file
        if (path.startsWith("/") && new File(path).isFile()) {
            return new File(path);
        }

        String assetPath = path;
        if (assetPath.startsWith("file://")) assetPath = assetPath.substring(7);
        if (assetPath.contains("_capacitor_file_/")) {
            assetPath = assetPath.substring(assetPath.indexOf("_capacitor_file_/") + 17);
        }
        if (assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
            try {
                java.net.URI uri = java.net.URI.create(assetPath);
                String p = uri.getPath();
                if (p != null) assetPath = p.startsWith("/") ? p.substring(1) : p;
            } catch (Exception ignored) {}
        }
        while (assetPath.startsWith("/")) assetPath = assetPath.substring(1);
        if (assetPath.startsWith("public/")) assetPath = assetPath.substring(7);

        String[] candidates = {"public/" + assetPath, assetPath};
        File dir = new File(appContext.getCacheDir(), "audio_src");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();

        IOException last = null;
        for (String candidate : candidates) {
            try {
                AssetFileDescriptor afd = appContext.getAssets().openFd(candidate);
                long len = afd.getLength();
                String safe = candidate.replaceAll("[^a-zA-Z0-9._-]", "_");
                if (safe.length() > 60) safe = safe.substring(0, 60);
                File out = new File(dir, safe + "_" + len + ".bin");
                if (out.exists() && out.length() == len) {
                    afd.close();
                    return out;
                }
                // Stream copy — MP3 is a few MB, ~100ms, not a full PCM decode
                try (InputStream in = afd.createInputStream();
                     FileOutputStream fos = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) >= 0) {
                        fos.write(buf, 0, n);
                    }
                    fos.flush();
                }
                afd.close();
                return out;
            } catch (IOException e) {
                last = e;
            }
        }
        throw new IOException("Asset not found: " + path, last);
    }

    private void cancelCrossfade() {
        if (crossfadeRunnable != null) {
            mainHandler.removeCallbacks(crossfadeRunnable);
            crossfadeRunnable = null;
        }
    }

    private void cancelFadeAnimOnly() {
        if (fadeRunnable != null) {
            mainHandler.removeCallbacks(fadeRunnable);
            fadeRunnable = null;
        }
    }

    private void cancelNamed(Runnable r) {
        if (r != null) mainHandler.removeCallbacks(r);
    }
}
