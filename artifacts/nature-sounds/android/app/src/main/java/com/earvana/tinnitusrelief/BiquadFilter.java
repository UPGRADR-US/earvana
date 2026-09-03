package com.earvana.tinnitusrelief;

public class BiquadFilter {
    private double b0, b1, b2, a1, a2;
    private double x1, x2, y1, y2;
    private boolean active = false;

    public BiquadFilter() {
        reset();
    }

    public synchronized void reset() {
        x1 = x2 = y1 = y2 = 0;
    }

    public synchronized void setBypass() {
        active = false;
    }

    public boolean isActive() {
        return active;
    }

    public synchronized void configurePeaking(double sampleRate, double freq, double Q, double dbGain) {
        if (freq <= 0 || freq >= sampleRate / 2) {
            active = false;
            return;
        }
        active = true;

        double w0 = 2.0 * Math.PI * freq / sampleRate;
        double cosW0 = Math.cos(w0);
        double sinW0 = Math.sin(w0);
        double alpha = sinW0 / (2.0 * Q);
        double A = Math.pow(10.0, dbGain / 40.0);

        double b0_raw = 1.0 + alpha * A;
        double b1_raw = -2.0 * cosW0;
        double b2_raw = 1.0 - alpha * A;
        double a0_raw = 1.0 + alpha / A;
        double a1_raw = -2.0 * cosW0;
        double a2_raw = 1.0 - alpha / A;

        b0 = b0_raw / a0_raw;
        b1 = b1_raw / a0_raw;
        b2 = b2_raw / a0_raw;
        a1 = a1_raw / a0_raw;
        a2 = a2_raw / a0_raw;
    }

    public synchronized void configureNotch(double sampleRate, double freq, double Q) {
        if (freq <= 0 || freq >= sampleRate / 2) {
            active = false;
            return;
        }
        active = true;

        double w0 = 2.0 * Math.PI * freq / sampleRate;
        double cosW0 = Math.cos(w0);
        double sinW0 = Math.sin(w0);
        double alpha = sinW0 / (2.0 * Q);

        double b0_raw = 1.0;
        double b1_raw = -2.0 * cosW0;
        double b2_raw = 1.0;
        double a0_raw = 1.0 + alpha;
        double a1_raw = -2.0 * cosW0;
        double a2_raw = 1.0 - alpha;

        b0 = b0_raw / a0_raw;
        b1 = b1_raw / a0_raw;
        b2 = b2_raw / a0_raw;
        a1 = a1_raw / a0_raw;
        a2 = a2_raw / a0_raw;
    }

    /** Audio thread only — not synchronized (per-sample locks caused glitches). */
    public float process(float x) {
        if (!active) {
            return x;
        }
        double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        return (float) y;
    }
}
