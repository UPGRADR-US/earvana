import { useState, useRef, useCallback, useEffect } from "react";
import { TRACKS, SoundTrack } from "../sounds";

const DEFAULT_CROSSFADE  = 15;  // seconds — used when a track has no crossfadeDuration
const FADE_IN_DURATION   = 5;   // seconds — global fade-in on every play()

// Pre-computed fade-out curve: power-2 shape so dB drops slowly at first
// then accelerates — starts barely perceptible, ends in a steep plunge.
// Index 0 = start of fade (gain=1.0), last index = end (gain≈0).
const FADE_OUT_N = 512;
const FADE_OUT_CURVE = (() => {
  const c = new Float32Array(FADE_OUT_N);
  for (let i = 0; i < FADE_OUT_N; i++) {
    const t = 1 - i / (FADE_OUT_N - 1); // 1 → 0
    c[i] = Math.max(t * t, 0.0001);      // t² shape; clamp away from true zero
  }
  return c;
})();

// Pre-computed equal-power curves (128 samples).
// Fade-in:  sin(t·π/2)  — starts slow, ends fast
// Fade-out: cos(t·π/2)  — starts fast, ends slow
// At every point sin²+cos²=1, so combined RMS energy stays constant throughout.
const CURVE_N = 128;
const EQUAL_POWER_IN  = new Float32Array(CURVE_N);
const EQUAL_POWER_OUT = new Float32Array(CURVE_N);
for (let i = 0; i < CURVE_N; i++) {
  const t = i / (CURVE_N - 1);
  EQUAL_POWER_IN[i]  = Math.sin(t * Math.PI / 2);
  EQUAL_POWER_OUT[i] = Math.cos(t * Math.PI / 2);
}

export type TrackState = {
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  volume: number; // 0 to 1
};

export type AudioEngineState = {
  tracks: Record<string, TrackState>;
  masterVolume: number;
  play: (trackId: string) => Promise<void>;
  pause: (trackId: string) => void;
  resume: () => Promise<void>;
  setVolume: (trackId: string, volume: number) => void;
  setMasterVolume: (volume: number) => void;
  stopAll: () => void;
  lastPlayedId: string | null;
  startFadeOut: (durationSeconds: number) => void;
  cancelFade: () => void;
};

// Represents a track's audio state
class TrackEngine {
  id: string;
  url: string;
  context: AudioContext;
  masterGain: GainNode;
  trackGain: GainNode;
  buffer: AudioBuffer | null = null;

  // Per-track loop settings (resolved from SoundTrack metadata)
  crossfadeDuration: number;
  loopStart: number;       // seconds into file; 0 = start of file
  loopEnd: number | null;  // seconds into file; null = use full buffer duration

  // Two slots ping-pong for seamless crossfade looping
  sources: [AudioBufferSourceNode | null, AudioBufferSourceNode | null] = [null, null];
  gains: [GainNode | null, GainNode | null] = [null, null];
  currentSlot: 0 | 1 = 0;

  timeoutId: number | null = null;
  isPlaying: boolean = false;
  volume: number = 0.5;  // target volume; ramps here on play()

  constructor(track: SoundTrack, context: AudioContext, masterGain: GainNode) {
    this.id = track.id;
    this.url = track.file;
    this.context = context;
    this.masterGain = masterGain;

    this.crossfadeDuration = track.crossfadeDuration ?? DEFAULT_CROSSFADE;
    this.loopStart = track.loopStart ?? 0;
    this.loopEnd = track.loopEnd ?? null;

    this.trackGain = this.context.createGain();
    this.trackGain.connect(this.masterGain);
    this.trackGain.gain.value = 0;  // starts silent; play() fades in
  }

  // Returns the effective loop region length once the buffer is loaded
  private regionDuration(): number {
    const end = this.loopEnd ?? this.buffer!.duration;
    return end - this.loopStart;
  }

  async load(): Promise<void> {
    if (this.buffer) return;
    const response = await fetch(import.meta.env.BASE_URL + this.url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(arrayBuffer);
  }

  play() {
    if (this.isPlaying || !this.buffer) return;
    this.isPlaying = true;
    this.currentSlot = 0;

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    const gain = this.context.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(this.trackGain);

    const startTime = this.context.currentTime;

    // Equal-power fade-in: ramp trackGain from 0 → target volume on a sin curve
    this.trackGain.gain.cancelScheduledValues(startTime);
    this.trackGain.gain.setValueAtTime(0, startTime);
    // Scale the curve to the target volume then apply over FADE_IN_DURATION
    const fadeInScaled = EQUAL_POWER_IN.map(v => v * this.volume);
    this.trackGain.gain.setValueCurveAtTime(fadeInScaled, startTime, FADE_IN_DURATION);

    // Start playback at loopStart offset, play for regionDuration
    source.start(startTime, this.loopStart, this.regionDuration());

    this.sources[0] = source;
    this.gains[0] = gain;

    // Schedule first crossfade: crossfadeDuration before the region ends
    this.scheduleNextLoop(startTime + this.regionDuration() - this.crossfadeDuration);
  }

  scheduleNextLoop(targetTime: number) {
    if (!this.isPlaying || !this.buffer) return;

    const timeUntilNext = targetTime - this.context.currentTime;

    // If more than 1s away, poll again closer to the time
    if (timeUntilNext > 1) {
      this.timeoutId = window.setTimeout(
        () => this.scheduleNextLoop(targetTime),
        Math.max((timeUntilNext - 1) * 1000, 0)
      );
      return;
    }

    const outSlot = this.currentSlot;
    const inSlot: 0 | 1 = outSlot === 0 ? 1 : 0;
    const xfade = this.crossfadeDuration;

    // Start the incoming source from loopStart, play for regionDuration
    const inSource = this.context.createBufferSource();
    inSource.buffer = this.buffer;
    const inGain = this.context.createGain();
    const crossStart = Math.max(targetTime, this.context.currentTime);
    inGain.gain.setValueAtTime(0, crossStart);
    inGain.gain.setValueCurveAtTime(EQUAL_POWER_IN, crossStart, xfade);
    inSource.connect(inGain);
    inGain.connect(this.trackGain);
    inSource.start(crossStart, this.loopStart, this.regionDuration());

    // Fade out the outgoing source using equal-power cosine curve
    const outGain = this.gains[outSlot];
    const outSource = this.sources[outSlot];
    if (outGain) {
      outGain.gain.setValueAtTime(outGain.gain.value, crossStart);
      outGain.gain.setValueCurveAtTime(EQUAL_POWER_OUT, crossStart, xfade);
    }

    // Store incoming in the new slot and advance the pointer
    this.sources[inSlot] = inSource;
    this.gains[inSlot] = inGain;
    this.currentSlot = inSlot;

    // Clean up outgoing after crossfade completes
    const cleanupDelay = (crossStart - this.context.currentTime + xfade + 0.1) * 1000;
    window.setTimeout(() => {
      try { outSource?.stop(); } catch { /* already stopped */ }
      outSource?.disconnect();
      outGain?.disconnect();
      if (this.sources[outSlot] === outSource) this.sources[outSlot] = null;
      if (this.gains[outSlot] === outGain) this.gains[outSlot] = null;
    }, Math.max(cleanupDelay, 0));

    // Schedule the next crossfade
    this.scheduleNextLoop(crossStart + this.regionDuration() - xfade);
  }

  pause() {
    this.isPlaying = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    for (let i = 0; i < 2; i++) {
      try { this.sources[i]?.stop(); } catch { /* already stopped */ }
      this.sources[i]?.disconnect();
      this.gains[i]?.disconnect();
      this.sources[i] = null;
      this.gains[i] = null;
    }
  }

  setVolume(vol: number) {
    this.volume = vol;
    // Only touch the gain node while actively playing — otherwise play() will
    // apply the correct value (and fade-in ramp) when it starts.
    if (!this.isPlaying) return;
    const t = this.context.currentTime;
    this.trackGain.gain.cancelScheduledValues(t);
    if (this.context.state === 'running') {
      this.trackGain.gain.setTargetAtTime(vol, t, 0.1);
    } else {
      this.trackGain.gain.value = vol;
    }
  }
}

export function useAudioEngine(): AudioEngineState {
  const [tracksState, setTracksState] = useState<Record<string, TrackState>>(
    TRACKS.reduce((acc, t) => ({
      ...acc,
      [t.id]: { isPlaying: false, isLoading: false, hasError: false, volume: 0.5 }
    }), {})
  );
  const [masterVolume, setMasterVolumeState] = useState(0.8);

  const contextRef    = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const fadeGainRef   = useRef<GainNode | null>(null);
  const enginesRef    = useRef<Record<string, TrackEngine>>({});
  const lastPlayedIdRef = useRef<string | null>(null);
  const wakeLockRef   = useRef<WakeLockSentinel | null>(null);
  const keepAliveRef  = useRef<HTMLAudioElement | null>(null);

  // ── Wake Lock (Android Chrome) ───────────────────────────────────────────
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); }
    catch { /* not supported or denied — silent */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // ── iOS background-audio keep-alive + AudioContext auto-resume ───────────
  // iOS suspends the AudioContext when the screen locks unless there is an
  // HTMLAudioElement playing.  We route a zero-gain BufferSource through a
  // MediaStreamDestination → <audio> element so iOS treats the whole session
  // as active media.  We also listen for context suspension and immediately
  // resume it when the page becomes visible again.
  const startKeepAlive = useCallback((ctx: AudioContext) => {
    if (keepAliveRef.current) return; // already running
    try {
      // 1-second silent buffer, looped forever
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop   = true;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start();

      const el = new Audio();
      el.srcObject = dest.stream;
      el.volume    = 0;           // completely inaudible
      el.play().catch(() => {});  // called inside a user-gesture — should succeed
      keepAliveRef.current = el;
    } catch { /* createMediaStreamDestination unavailable — graceful degradation */ }
  }, []);

  const stopKeepAlive = useCallback(() => {
    if (!keepAliveRef.current) return;
    keepAliveRef.current.pause();
    keepAliveRef.current.srcObject = null;
    keepAliveRef.current = null;
  }, []);

  // Re-acquire wake lock and resume suspended context when tab returns to foreground
  useEffect(() => {
    const onVisibilityChange = () => {
      const anyPlaying = Object.values(enginesRef.current).some(e => e.isPlaying);
      if (document.visibilityState === 'visible') {
        if (anyPlaying) acquireWakeLock();
        // Resume AudioContext if iOS suspended it while the screen was locked
        const ctx = contextRef.current;
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      } else {
        // Screen locked — iOS may suspend; set up auto-resume on statechange
        const ctx = contextRef.current;
        if (ctx && anyPlaying) {
          const onStateChange = () => {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          };
          ctx.addEventListener('statechange', onStateChange, { once: true });
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [acquireWakeLock]);

  // Stable refs so MediaSession action handlers always call the latest version
  const playRef   = useRef<((id: string) => Promise<void>) | null>(null);
  const pauseRef  = useRef<((id: string) => void) | null>(null);
  const resumeRef = useRef<(() => Promise<void>) | null>(null);

  const initContext = useCallback(() => {
    if (!contextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      contextRef.current = new Ctx();
      masterGainRef.current = contextRef.current.createGain();
      masterGainRef.current.gain.value = masterVolume;
      fadeGainRef.current = contextRef.current.createGain();
      fadeGainRef.current.gain.value = 1.0;
      masterGainRef.current.connect(fadeGainRef.current);
      fadeGainRef.current.connect(contextRef.current.destination);
    }
    if (contextRef.current.state === 'suspended') {
      contextRef.current.resume().catch(() => {});
    }
    // Start iOS keep-alive on first user interaction
    startKeepAlive(contextRef.current);
  }, [masterVolume, startKeepAlive]);

  const play = useCallback(async (trackId: string) => {
    initContext();
    const ctx = contextRef.current!;
    const mg = masterGainRef.current!;

    const track = TRACKS.find(t => t.id === trackId);
    if (!track) return;

    // Stop every other playing track first — only one track at a time.
    Object.entries(enginesRef.current).forEach(([id, eng]) => {
      if (id !== trackId && eng.isPlaying) eng.pause();
    });
    setTracksState(s => {
      const ns = { ...s };
      Object.keys(ns).forEach(id => { if (id !== trackId) ns[id] = { ...ns[id], isPlaying: false }; });
      return ns;
    });

    if (!enginesRef.current[trackId]) {
      enginesRef.current[trackId] = new TrackEngine(track, ctx, mg);
      enginesRef.current[trackId].setVolume(tracksState[trackId].volume);
    }

    const engine = enginesRef.current[trackId];

    lastPlayedIdRef.current = trackId;
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isLoading: true, hasError: false } }));
    try {
      await engine.load();
      engine.play();
      setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: true, isLoading: false } }));
      acquireWakeLock();
      // Tell iOS lock screen what's playing
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.name,
          artist: 'Tinnitus Relief by Earvana',
          album: 'Nature Sounds',
        });
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch (e) {
      console.error("Failed to play track", e);
      setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isLoading: false, hasError: true } }));
    }
  }, [initContext, tracksState, acquireWakeLock]);

  // Resume the last-played track with a fresh fade-in
  const resume = useCallback(async () => {
    if (lastPlayedIdRef.current) await play(lastPlayedIdRef.current);
  }, [play]);

  const pause = useCallback((trackId: string) => {
    const engine = enginesRef.current[trackId];
    if (engine) engine.pause();
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: false } }));
    releaseWakeLock();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }, [releaseWakeLock]);

  const setVolume = useCallback((trackId: string, volume: number) => {
    const engine = enginesRef.current[trackId];
    if (engine) {
      engine.setVolume(volume);
    }
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], volume } }));
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    setMasterVolumeState(volume);
    if (masterGainRef.current) {
      // Cancel any automation and immediately apply the new volume level
      const t = contextRef.current?.currentTime ?? 0;
      masterGainRef.current.gain.cancelScheduledValues(t);
      masterGainRef.current.gain.value = volume;
    }
  }, []);

  const stopAll = useCallback(() => {
    Object.keys(enginesRef.current).forEach(id => {
      enginesRef.current[id].pause();
    });
    setTracksState(s => {
      const ns = { ...s };
      Object.keys(ns).forEach(id => { ns[id].isPlaying = false; });
      return ns;
    });
    releaseWakeLock();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }, [releaseWakeLock]);

  /* Kick off the timed power-curve fade on the dedicated fadeGain node.
     durationSeconds is the wall-clock time until the gain reaches ~0. */
  const startFadeOut = useCallback((durationSeconds: number) => {
    const fg  = fadeGainRef.current;
    const ctx = contextRef.current;
    if (!fg || !ctx) return;
    const now = ctx.currentTime;
    fg.gain.cancelScheduledValues(now);
    fg.gain.setValueAtTime(1.0, now);
    fg.gain.setValueCurveAtTime(FADE_OUT_CURVE, now, durationSeconds);
  }, []);

  /* Cancel any in-progress fade and immediately restore full gain. */
  const cancelFade = useCallback(() => {
    const fg  = fadeGainRef.current;
    const ctx = contextRef.current;
    if (!fg || !ctx) return;
    const t = ctx.currentTime;
    fg.gain.cancelScheduledValues(t);
    fg.gain.setValueAtTime(1.0, t);
  }, []);

  // Keep stable refs so MediaSession callbacks always use the latest functions
  // without being stale closures.
  useEffect(() => { playRef.current   = play;   }, [play]);
  useEffect(() => { pauseRef.current  = pause;  }, [pause]);
  useEffect(() => { resumeRef.current = resume; }, [resume]);

  // Wire MediaSession lock-screen action handlers once on mount.
  // Handlers read from refs so they never become stale.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => {
      resumeRef.current?.();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      const id = lastPlayedIdRef.current;
      if (id) pauseRef.current?.(id);
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      const id = lastPlayedIdRef.current;
      if (id) pauseRef.current?.(id);
    });
  }, []);

  return {
    tracks: tracksState,
    masterVolume,
    lastPlayedId: lastPlayedIdRef.current,
    play,
    pause,
    resume,
    setVolume,
    setMasterVolume,
    stopAll,
    startFadeOut,
    cancelFade,
  };
}