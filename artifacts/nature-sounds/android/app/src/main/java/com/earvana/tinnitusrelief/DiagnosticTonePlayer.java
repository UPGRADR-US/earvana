package com.earvana.tinnitusrelief;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.util.Log;

/**
 * Sine-wave test tone for the diagnostics frequency matcher.
 * Dedicated AudioTrack so tones work on Android (Web Audio is unreliable in WebView)
 * and can mix with the therapy service when both are playing.
 */
public class DiagnosticTonePlayer {
    private static final String TAG = "DiagnosticTonePlayer";
    private static final int SAMPLE_RATE = 44100;

    private AudioTrack audioTrack;
    private Thread playThread;
    private volatile boolean running = false;

    private volatile double frequency = 1000.0;
    private volatile float gain = 0.12f;
    private double phase = 0.0;

    public synchronized void play(double freq, float gain) {
        stop();
        this.frequency = Math.max(20.0, Math.min(freq, 20000.0));
        this.gain = Math.max(0f, Math.min(gain, 1f));
        this.phase = 0.0;
        this.running = true;

        int minBuf = AudioTrack.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
        );
        int bufSize = Math.max(minBuf, SAMPLE_RATE / 10); // ~100ms

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                audioTrack = new AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build())
                        .setAudioFormat(new AudioFormat.Builder()
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .setSampleRate(SAMPLE_RATE)
                                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                                .build())
                        .setBufferSizeInBytes(bufSize)
                        .setTransferMode(AudioTrack.MODE_STREAM)
                        .build();
            } else {
                audioTrack = new AudioTrack(
                        AudioManager.STREAM_MUSIC,
                        SAMPLE_RATE,
                        AudioFormat.CHANNEL_OUT_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        bufSize,
                        AudioTrack.MODE_STREAM
                );
            }

            audioTrack.play();

            final AudioTrack track = audioTrack;
            playThread = new Thread(() -> writeLoop(track, bufSize), "DiagTone");
            playThread.setPriority(Thread.MAX_PRIORITY);
            playThread.start();
            Log.d(TAG, "Playing test tone " + frequency + " Hz gain=" + this.gain);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start test tone", e);
            stop();
            throw new RuntimeException("Test tone failed: " + e.getMessage(), e);
        }
    }

    public void setGain(float gain) {
        this.gain = Math.max(0f, Math.min(gain, 1f));
    }

    public synchronized void stop() {
        running = false;
        Thread t = playThread;
        playThread = null;
        if (t != null) {
            try {
                t.join(300);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
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
        phase = 0.0;
    }

    private void writeLoop(AudioTrack track, int bufSize) {
        // Generate in short chunks for responsive freq/gain changes
        int framesPerChunk = Math.max(256, bufSize / 8);
        short[] buffer = new short[framesPerChunk];
        final double twoPi = 2.0 * Math.PI;

        while (running && track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
            double freq = frequency;
            float amp = gain;
            double phaseInc = twoPi * freq / SAMPLE_RATE;
            double p = phase;

            for (int i = 0; i < framesPerChunk; i++) {
                float sample = (float) (Math.sin(p) * amp);
                // soft clip
                if (sample > 1f) sample = 1f;
                if (sample < -1f) sample = -1f;
                buffer[i] = (short) (sample * 32767f);
                p += phaseInc;
            }
            phase = p % twoPi;

            int written = 0;
            while (written < buffer.length && running) {
                int n = track.write(buffer, written, buffer.length - written);
                if (n < 0) {
                    Log.e(TAG, "AudioTrack.write error " + n);
                    running = false;
                    break;
                }
                written += n;
            }
        }
    }
}
