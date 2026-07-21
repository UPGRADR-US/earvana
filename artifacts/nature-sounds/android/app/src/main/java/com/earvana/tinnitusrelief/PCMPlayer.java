package com.earvana.tinnitusrelief;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Build;
import android.util.Log;

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

    private int currentPlaySampleIndex = 0;

    public PCMPlayer(AudioDecoder.DecodedAudio audio, float loopStart, Float loopEnd, float crossfade, float volume, float masterVolume) {
        this.sampleRate = audio.sampleRate;
        this.channels = audio.channels;
        this.samples = audio.samples;
        this.trackVolume = volume;
        this.masterVolume = masterVolume;

        for (int i = 0; i < 5; i++) {
            eqLeft[i] = new BiquadFilter();
            eqRight[i] = new BiquadFilter();
        }

        float duration = audio.duration;
        float effectiveCrossfade = Math.min(crossfade, duration / 3.0f);

        this.loopStartSample = (int) (loopStart * sampleRate) * channels;
        float endSec = (loopEnd != null && loopEnd > loopStart && loopEnd <= duration) ? loopEnd : duration;
        this.loopEndSample = (int) (endSec * sampleRate) * channels;
        this.crossfadeSamples = Math.max(1, (int) (effectiveCrossfade * sampleRate));

        float[] zeroGains = new float[]{0, 0, 0, 0, 0};
        setEq(zeroGains);
        setNotch(null);
        setBoost(null);
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

        int channelConfig = (channels == 2) ? AudioFormat.CHANNEL_OUT_STEREO : AudioFormat.CHANNEL_OUT_MONO;
        int minBuf = AudioTrack.getMinBufferSize(sampleRate, channelConfig, AudioFormat.ENCODING_PCM_16BIT);
        int bufferSize = Math.max(minBuf, 4096) * 2;

        AudioTrack.Builder builder = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(channelConfig)
                        .build())
                .setBufferSizeInBytes(bufferSize)
                .setTransferMode(AudioTrack.MODE_STREAM);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Prefer low latency when available; fall back if the device rejects it.
            try {
                builder.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY);
            } catch (Exception ignored) {}
        }
        try {
            audioTrack = builder.build();
        } catch (Exception e) {
            // Some OEMs reject LOW_LATENCY; rebuild without it.
            audioTrack = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(channelConfig)
                            .build())
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
    public float getPosition() { return (float) currentPlaySampleIndex / (sampleRate * channels); }

    private void audioLoop() {
        int pos = 0;
        final short[] localSamples = samples;
        if (localSamples == null) {
            isPlaying = false;
            return;
        }

        int crossfadeStartSample = loopEndSample - (crossfadeSamples * channels);
        if (crossfadeStartSample < loopStartSample) {
            crossfadeStartSample = loopStartSample;
        }

        int writeFrameSize = 1024;
        int writeBufferSize = writeFrameSize * channels;
        short[] outputBuffer = new short[writeBufferSize];

        while (isPlaying) {
            short[] pcm = samples;
            if (pcm == null) break;

            int writeSamplesCount = 0;
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

                float volScale = currentTrackVol * currentMasterVol * currentFadeMult * currentTimerFade;

                for (int c = 0; c < channels; c++) {
                    int sampleIndex = pos + c;
                    float outSample = 0.0f;

                    if (sampleIndex < pcm.length) {
                        if (sampleIndex < crossfadeStartSample) {
                            outSample = pcm[sampleIndex] / 32768.0f;
                        } else {
                            int currentFrame = (sampleIndex - crossfadeStartSample) / channels;
                            float progress = Math.min(1.0f, (float) currentFrame / crossfadeSamples);
                            double theta = progress * Math.PI / 2.0;

                            float endSample = pcm[sampleIndex] / 32768.0f;
                            int startTargetIndex = loopStartSample + (currentFrame * channels) + c;
                            float startSample = (startTargetIndex < pcm.length) ? pcm[startTargetIndex] / 32768.0f : 0.0f;

                            outSample = (float) (endSample * Math.cos(theta) + startSample * Math.sin(theta));
                        }

                        if (c == 0) {
                            for (int i = 0; i < 5; i++) outSample = eqLeft[i].process(outSample);
                            outSample = notchLeft.process(outSample);
                            outSample = boostLeft.process(outSample);
                        } else {
                            for (int i = 0; i < 5; i++) outSample = eqRight[i].process(outSample);
                            outSample = notchRight.process(outSample);
                            outSample = boostRight.process(outSample);
                        }
                        outSample *= volScale;
                    }

                    if (outSample > 1.0f) outSample = 1.0f;
                    else if (outSample < -1.0f) outSample = -1.0f;

                    outputBuffer[f * channels + c] = (short) (outSample * 32767.0f);
                    writeSamplesCount++;
                }

                pos += channels;
                if (pos >= loopEndSample) {
                    pos = loopStartSample + (crossfadeSamples * channels);
                }
            }

            synchronized (this) {
                fadeMultiplier = currentFadeMult;
                timerFadeLevel = currentTimerFade;
                fadeMultiplierStep = fadeStep;
                timerFadeLevelStep = timerStep;
            }

            currentPlaySampleIndex = pos;

            AudioTrack track = audioTrack;
            if (isPlaying && track != null) {
                int written = track.write(outputBuffer, 0, writeSamplesCount);
                if (written < 0) break;
            }
        }
        Log.d(TAG, "Playback thread exiting.");
    }
}
