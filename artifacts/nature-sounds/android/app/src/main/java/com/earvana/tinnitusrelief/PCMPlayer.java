package com.earvana.tinnitusrelief;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Build;
import android.util.Log;

import java.util.concurrent.atomic.AtomicInteger;

public class PCMPlayer {
    private static final String TAG = "PCMPlayer";

    private final int sampleRate;
    private final int channels;
    private short[] samples; // released on stop to free large native-adjacent heap

    private AudioTrack audioTrack;
    private Thread playThread;
    private volatile boolean isPlaying = false;
    private volatile boolean isPaused = false;

    private final int loopStartSample;
    private final int loopEndSample;
    private final int crossfadeSamples;

    private float trackVolume = 0.5f;
    private float masterVolume = 0.8f;
    private float fadeMultiplier = 1.0f;
    private float timerFadeLevel = 1.0f;

    private float targetFadeMultiplier = 1.0f;
    private float targetTimerFadeLevel = 1.0f;
    private float fadeMultiplierStep = 0.0f;
    private float timerFadeLevelStep = 0.0f;

    private final BiquadFilter[] eqLeft = new BiquadFilter[5];
    private final BiquadFilter[] eqRight = new BiquadFilter[5];
    private final BiquadFilter notchLeft = new BiquadFilter();
    private final BiquadFilter notchRight = new BiquadFilter();
    private final BiquadFilter boostLeft = new BiquadFilter();
    private final BiquadFilter boostRight = new BiquadFilter();

    private static final double[] EQ_FREQUENCIES = {100.0, 330.0, 1000.0, 3300.0, 10000.0};
    private static final double[] EQ_Q_VALUES = {0.9, 1.0, 1.0, 1.0, 0.9};
    private static final float LIMITER_THRESHOLD = 0.89f; // -1 dBFS
    private static final float LIMITER_RELEASE_SEC = 0.06f;

    private int currentPlaySampleIndex = 0;
    private float limiterEnv = 0f;
    private final float limiterReleaseCoef;
    private final AtomicInteger framesReady;
    private volatile boolean decodeComplete;
    private volatile int endFrame;
    private volatile int xfadeStartFrame;
    private final int startFrame;
    private final int xfadeFrames;

    public PCMPlayer(AudioDecoder.DecodedAudio audio, float loopStart, Float loopEnd, float crossfade, float volume, float masterVolume) {
        AudioDecoder.ensureStereo(audio);
        this.sampleRate = audio.sampleRate;
        this.channels = 2;
        this.samples = audio.samples;
        this.framesReady = audio.framesReady;
        this.decodeComplete = audio.complete;
        this.trackVolume = volume;
        this.masterVolume = masterVolume;
        this.limiterReleaseCoef = (float) Math.exp(-1.0 / (LIMITER_RELEASE_SEC * sampleRate));

        for (int i = 0; i < 5; i++) {
            eqLeft[i] = new BiquadFilter();
            eqRight[i] = new BiquadFilter();
        }

        int estimatedFrames = Math.max(audio.framesReady.get(), 1);
        if (audio.duration > 0) {
            estimatedFrames = Math.max(estimatedFrames, (int) Math.floor(audio.duration * sampleRate));
        }
        estimatedFrames = Math.min(estimatedFrames, audio.samples.length / 2);

        this.startFrame = Math.max(0, (int) Math.floor(loopStart * sampleRate));
        int end = estimatedFrames;
        if (loopEnd != null && loopEnd > loopStart) {
            end = Math.min(estimatedFrames, (int) Math.floor(loopEnd * sampleRate));
        }
        if (end <= startFrame) end = estimatedFrames;

        int regionFrames = Math.max(1, end - startFrame);
        float xfadeSec = Math.min(crossfade, (regionFrames / (float) sampleRate) / 2.2f);
        int xf = Math.max(1, (int) Math.floor(xfadeSec * sampleRate));
        this.xfadeFrames = Math.min(xf, Math.max(1, regionFrames / 2));
        this.endFrame = end;
        this.xfadeStartFrame = Math.max(startFrame, end - this.xfadeFrames);
        this.loopStartSample = startFrame * 2;
        this.loopEndSample = end * 2;
        this.crossfadeSamples = this.xfadeFrames;

        Log.d(TAG, "loop region~=" + (regionFrames / (float) sampleRate)
                + "s xfade=" + (this.xfadeFrames / (float) sampleRate)
                + "s ready=" + audio.framesReady.get() + " complete=" + audio.complete);

        setEq(new float[]{0, 0, 0, 0, 0});
        setNotch(null);
        setBoost(null);
    }

    public void markDecodeComplete(int actualFrames) {
        int end = Math.max(startFrame + 2, actualFrames);
        endFrame = end;
        xfadeStartFrame = Math.max(startFrame, end - xfadeFrames);
        decodeComplete = true;
        framesReady.set(actualFrames);
        Log.d(TAG, "decode complete actualFrames=" + actualFrames
                + " xfadeStart=" + (xfadeStartFrame / (float) sampleRate) + "s");
    }

    public synchronized void play(boolean skipFadeIn) {
        if (isPlaying) return;
        if (samples == null) {
            Log.e(TAG, "play() called after samples released");
            return;
        }
        isPlaying = true;
        isPaused = false;

        fadeMultiplier = skipFadeIn ? 1.0f : 0.0f;
        targetFadeMultiplier = 1.0f;
        fadeMultiplierStep = skipFadeIn ? 0.0f : (1.0f / (1.5f * sampleRate));

        timerFadeLevel = 1.0f;
        targetTimerFadeLevel = 1.0f;
        timerFadeLevelStep = 0.0f;

        // Always 2ch PCM into the mixer — never offload (that's the OEM Dolby path).
        int channelConfig = AudioFormat.CHANNEL_OUT_STEREO;
        int minBuf = AudioTrack.getMinBufferSize(sampleRate, channelConfig, AudioFormat.ENCODING_PCM_16BIT);
        int bufferSize = Math.max(minBuf, 4096) * 2;
        AudioAttributes attrs = stereoPlaybackAttributes();
        AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sampleRate)
                .setChannelMask(channelConfig)
                .build();

        AudioTrack.Builder builder = new AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(format)
                .setBufferSizeInBytes(bufferSize)
                .setTransferMode(AudioTrack.MODE_STREAM);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setOffloadedPlayback(false);
        }
        try {
            audioTrack = builder.build();
        } catch (Exception e) {
            Log.w(TAG, "AudioTrack build failed, retrying defaults", e);
            audioTrack = new AudioTrack.Builder()
                    .setAudioAttributes(attrs)
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(bufferSize)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
        }

        audioTrack.play();
        playThread = new Thread(this::audioLoop, "PCMPlayer-Thread");
        playThread.setPriority(Thread.MAX_PRIORITY);
        playThread.start();
    }

    public synchronized void pause(float fadeSeconds, final Runnable onFinished) {
        if (!isPlaying || isPaused) {
            if (onFinished != null) onFinished.run();
            return;
        }
        isPaused = true;

        if (fadeSeconds <= 0) {
            stopImmediate();
            if (onFinished != null) onFinished.run();
            return;
        }

        targetFadeMultiplier = 0.0f;
        fadeMultiplierStep = -1.0f / (fadeSeconds * sampleRate);

        new Thread(() -> {
            try {
                Thread.sleep((long) (fadeSeconds * 1000) + 50);
            } catch (InterruptedException ignored) {}
            synchronized (PCMPlayer.this) {
                if (isPaused) {
                    stopImmediate();
                    if (onFinished != null) onFinished.run();
                }
            }
        }, "PCMPlayer-FadeOut").start();
    }

    /**
     * Stop playback and free the large PCM buffer. Safe to call from any thread;
     * never blocks the caller for more than a short join.
     */
    public synchronized void stopImmediate() {
        isPlaying = false;
        isPaused = false;

        AudioTrack track = audioTrack;
        audioTrack = null;
        if (track != null) {
            try {
                track.pause();
            } catch (Exception ignored) {}
            try {
                track.flush();
            } catch (Exception ignored) {}
            try {
                track.stop();
            } catch (Exception ignored) {}
            try {
                track.release();
            } catch (Exception ignored) {}
        }

        Thread thread = playThread;
        playThread = null;
        if (thread != null && thread != Thread.currentThread()) {
            try {
                thread.join(150);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }

        // Drop multi‑tens-of-MB PCM so the next decode has room on mid-range phones
        samples = null;
    }

    public synchronized void setVolume(float volume) { this.trackVolume = volume; }
    public synchronized void setMasterVolume(float volume) { this.masterVolume = volume; }

    public synchronized void setEq(float[] gains) {
        for (int i = 0; i < 5; i++) {
            float gain = (gains != null && i < gains.length) ? gains[i] : 0.0f;
            eqLeft[i].configurePeaking(sampleRate, EQ_FREQUENCIES[i], EQ_Q_VALUES[i], gain);
            eqRight[i].configurePeaking(sampleRate, EQ_FREQUENCIES[i], EQ_Q_VALUES[i], gain);
        }
    }

    public synchronized void setNotch(Float freq) {
        if (freq != null) {
            notchLeft.configureNotch(sampleRate, freq, 30.0);
            notchRight.configureNotch(sampleRate, freq, 30.0);
            boostLeft.setBypass();
            boostRight.setBypass();
        } else {
            notchLeft.setBypass();
            notchRight.setBypass();
        }
    }

    public synchronized void setBoost(Float freq) {
        if (freq != null) {
            boostLeft.configurePeaking(sampleRate, freq, 30.0, 12.0);
            boostRight.configurePeaking(sampleRate, freq, 30.0, 12.0);
            notchLeft.setBypass();
            notchRight.setBypass();
        } else {
            boostLeft.setBypass();
            boostRight.setBypass();
        }
    }

    public synchronized void startFadeOut(float durationSeconds) {
        targetTimerFadeLevel = 0.0001f;
        timerFadeLevelStep = -(1.0f - targetTimerFadeLevel) / (durationSeconds * sampleRate);
    }

    public synchronized void cancelFade() {
        timerFadeLevel = 1.0f;
        targetTimerFadeLevel = 1.0f;
        timerFadeLevelStep = 0.0f;
    }

    public boolean isPlaying() { return isPlaying && !isPaused; }

    /** 2ch PCM, never spatialized / virtualized (API 32+). */
    static AudioAttributes stereoPlaybackAttributes() {
        AudioAttributes.Builder b = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC);
        if (Build.VERSION.SDK_INT >= 32) {
            b.setSpatializationBehavior(AudioAttributes.SPATIALIZATION_BEHAVIOR_NEVER);
            b.setIsContentSpatialized(false);
        }
        return b.build();
    }
    public float getPosition() { return (float) currentPlaySampleIndex / (sampleRate * channels); }

    private void audioLoop() {
        short[] pcm = samples;
        if (pcm == null || pcm.length < 4) {
            isPlaying = false;
            return;
        }

        int frame = startFrame;
        int writeFrameSize = 1024;
        short[] outputBuffer = new short[writeFrameSize * 2];
        float env = limiterEnv;

        while (isPlaying) {
            pcm = samples;
            if (pcm == null) break;

            float currentTrackVol, currentMasterVol, currentFadeMult, currentTimerFade;
            float fadeStep, timerStep, targetFade, targetTimer;

            synchronized (this) {
                currentTrackVol = trackVolume;
                currentMasterVol = masterVolume;
                currentFadeMult = fadeMultiplier;
                currentTimerFade = timerFadeLevel;
                fadeStep = fadeMultiplierStep;
                timerStep = timerFadeLevelStep;
                targetFade = targetFadeMultiplier;
                targetTimer = targetTimerFadeLevel;
            }

            int writtenFrames = 0;
            for (int f = 0; f < writeFrameSize; f++) {
                if (fadeStep != 0.0f) {
                    currentFadeMult += fadeStep;
                    if ((fadeStep > 0 && currentFadeMult >= targetFade) || (fadeStep < 0 && currentFadeMult <= targetFade)) {
                        currentFadeMult = targetFade;
                        fadeStep = 0.0f;
                    }
                }
                if (timerStep != 0.0f) {
                    currentTimerFade += timerStep;
                    if (currentTimerFade <= targetTimer) {
                        currentTimerFade = targetTimer;
                        timerStep = 0.0f;
                    }
                }

                int ready = framesReady.get();
                int xStart = xfadeStartFrame;
                int need = frame + 1;
                if (frame >= xStart) need = Math.max(need, endFrame);
                while (isPlaying && ready < need && !decodeComplete) {
                    try {
                        Thread.sleep(4);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                    ready = framesReady.get();
                }
                if (!isPlaying) break;

                float volScale = currentTrackVol * currentMasterVol * currentFadeMult * currentTimerFade;
                float l;
                float r;
                int xStartNow = xfadeStartFrame;

                if (frame < xStartNow) {
                    int i = frame * 2;
                    l = pcm[i] / 32768.0f;
                    r = pcm[i + 1] / 32768.0f;
                } else {
                    int fadeI = frame - xStartNow;
                    float t = fadeI / (float) xfadeFrames;
                    if (t > 1f) t = 1f;
                    double theta = t * Math.PI / 2.0;
                    float fadeOut = (float) Math.cos(theta);
                    float fadeIn = (float) Math.sin(theta);
                    int endI = frame * 2;
                    int startI = (startFrame + fadeI) * 2;
                    float endL = (endI + 1 < pcm.length) ? pcm[endI] / 32768.0f : 0f;
                    float endR = (endI + 1 < pcm.length) ? pcm[endI + 1] / 32768.0f : 0f;
                    float startL = (startI + 1 < pcm.length) ? pcm[startI] / 32768.0f : 0f;
                    float startR = (startI + 1 < pcm.length) ? pcm[startI + 1] / 32768.0f : 0f;
                    l = endL * fadeOut + startL * fadeIn;
                    r = endR * fadeOut + startR * fadeIn;
                }

                for (int i = 0; i < 5; i++) l = eqLeft[i].process(l);
                l = notchLeft.process(l);
                l = boostLeft.process(l);
                for (int i = 0; i < 5; i++) r = eqRight[i].process(r);
                r = notchRight.process(r);
                r = boostRight.process(r);

                l *= volScale;
                r *= volScale;

                float peak = Math.max(Math.abs(l), Math.abs(r));
                if (peak > env) env = peak;
                else env = peak + limiterReleaseCoef * (env - peak);
                if (env > LIMITER_THRESHOLD) {
                    float g = LIMITER_THRESHOLD / env;
                    l *= g;
                    r *= g;
                }

                if (l > 1f) l = 1f; else if (l < -1f) l = -1f;
                if (r > 1f) r = 1f; else if (r < -1f) r = -1f;

                outputBuffer[f * 2] = (short) (l * 32767.0f);
                outputBuffer[f * 2 + 1] = (short) (r * 32767.0f);
                writtenFrames++;

                frame++;
                int endNow = endFrame;
                if (frame >= endNow) {
                    frame = startFrame + xfadeFrames;
                    if (frame >= endNow) frame = startFrame;
                }
            }

            synchronized (this) {
                fadeMultiplier = currentFadeMult;
                timerFadeLevel = currentTimerFade;
                fadeMultiplierStep = fadeStep;
                timerFadeLevelStep = timerStep;
            }

            limiterEnv = env;
            currentPlaySampleIndex = frame * 2;

            AudioTrack track = audioTrack;
            if (isPlaying && track != null) {
                int written = track.write(outputBuffer, 0, writtenFrames * 2);
                if (written < 0) break;
            }
        }
        Log.d(TAG, "Playback thread exiting.");
    }
}
