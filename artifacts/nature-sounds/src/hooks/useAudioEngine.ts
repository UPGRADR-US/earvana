import { useState, useRef, useCallback, useEffect } from "react";
import { TRACKS, SoundTrack } from "../sounds";

const DEFAULT_CROSSFADE  = 15;  // seconds
const FADE_IN_DURATION   = 5;   // seconds
const STOP_FADE_DURATION  = 0.75; // seconds — PLAY button / timer auto-stop fade
const TRACK_SWITCH_FADE   = 1.5;  // seconds — outgoing track crossfade when switching titles

// 5-band parametric EQ: centre frequencies and Q values
const EQ_FREQUENCIES = [100, 330, 1000, 3300, 10000] as const;
const EQ_Q_VALUES    = [0.9, 1.0, 1.0,  1.0,  0.9]  as const;

// Pre-computed equal-power crossfade curves (128 samples)
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
  volume: number;
};

export type AudioEngineState = {
  tracks: Record<string, TrackState>;
  masterVolume: number;
  play: (trackId: string) => Promise<void>;
  pause: (trackId: string) => void;
  resume: () => Promise<void>;
  setVolume: (trackId: string, volume: number) => void;
  setMasterVolume: (volume: number) => void;
  setEq: (gains: number[]) => void;
  stopAll: () => void;
  lastPlayedId: string | null;
  startFadeOut: (durationSeconds: number) => void;
  cancelFade: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// TrackEngine — one per track, manages two ping-pong AudioBufferSourceNodes
// for seamless equal-power crossfade looping.
// ─────────────────────────────────────────────────────────────────────────────
class TrackEngine {
  id: string;
  url: string;
  context: AudioContext;
  masterGain: GainNode;
  trackGain: GainNode;
  buffer: AudioBuffer | null = null;

  crossfadeDuration: number;
  loopStart: number;
  loopEnd: number | null;

  sources: [AudioBufferSourceNode | null, AudioBufferSourceNode | null] = [null, null];
  gains: [GainNode | null, GainNode | null] = [null, null];
  currentSlot: 0 | 1 = 0;
  slotStartTime: [number, number] = [0, 0];

  timeoutId: number | null = null;
  isPlaying: boolean = false;
  volume: number = 0.5;

  // Intended steady-state gain; more reliable than reading .gain.value
  // mid-automation on Safari/iOS.
  get currentGain(): number { return this.volume; }

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
    this.trackGain.gain.value = 0;
  }

  private regionDuration(): number {
    const end = this.loopEnd ?? this.buffer!.duration;
    return end - this.loopStart;
  }

  // Cap crossfade at regionDuration/3 — prevents two pathological cases:
  //   (a) crossfade ≥ regionDuration → crossStart ≤ 0 → fires immediately
  //   (b) crossfade × 2 > regionDuration → in-curve still running when next
  //       loop calls cancelScheduledValues on the same GainNode (undefined behaviour)
  private effectiveXfade(): number {
    return Math.min(this.crossfadeDuration, this.regionDuration() / 3);
  }

  async load(): Promise<void> {
    if (this.buffer) return;
    const response = await fetch(import.meta.env.BASE_URL + this.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

    const xfade = this.effectiveXfade();
    const startTime = this.context.currentTime;
    this.trackGain.gain.cancelScheduledValues(startTime);
    const fadeIn = Math.min(FADE_IN_DURATION, this.regionDuration() / 3);
    this.trackGain.gain.setValueAtTime(0, startTime);
    this.trackGain.gain.linearRampToValueAtTime(this.volume, startTime + fadeIn);

    source.start(startTime, this.loopStart, this.regionDuration());
    this.slotStartTime[0] = startTime;
    this.sources[0] = source;
    this.gains[0] = gain;
    this.scheduleNextLoop(startTime + this.regionDuration() - xfade);
  }

  scheduleNextLoop(targetTime: number) {
    if (!this.isPlaying || !this.buffer) return;
    const timeUntilNext = targetTime - this.context.currentTime;
    if (timeUntilNext > 1) {
      this.timeoutId = window.setTimeout(
        () => this.scheduleNextLoop(targetTime),
        Math.max((timeUntilNext - 1) * 1000, 0)
      );
      return;
    }

    const outSlot = this.currentSlot;
    const inSlot: 0 | 1 = outSlot === 0 ? 1 : 0;
    const xfade = this.effectiveXfade();

    const inSource = this.context.createBufferSource();
    inSource.buffer = this.buffer;
    const inGain = this.context.createGain();
    const crossStart = Math.max(targetTime, this.context.currentTime);
    // 10 ms offset: never schedule setValueAtTime and setValueCurveAtTime at the
    // exact same timestamp. iOS Safari's tie-breaking between these event types is
    // undefined — without the offset, the curve is sometimes silently dropped on
    // the first crossfade only.
    const curveStart = crossStart + 0.01;
    inGain.gain.setValueAtTime(0, crossStart);
    inGain.gain.setValueCurveAtTime(EQUAL_POWER_IN, curveStart, xfade);
    inSource.connect(inGain);
    inGain.connect(this.trackGain);
    inSource.start(crossStart, this.loopStart, this.regionDuration());
    this.slotStartTime[inSlot] = crossStart;

    const outGain = this.gains[outSlot];
    const outSource = this.sources[outSlot];
    if (outGain) {
      // Always start from 1 — Safari/iOS returns the last explicit setValueAtTime
      // (which is 0) after a curve ends, not the curve's final value.
      outGain.gain.cancelScheduledValues(crossStart);
      outGain.gain.setValueAtTime(1, crossStart);
      outGain.gain.setValueCurveAtTime(EQUAL_POWER_OUT, curveStart, xfade);
    }

    this.sources[inSlot] = inSource;
    this.gains[inSlot] = inGain;
    this.currentSlot = inSlot;

    const cleanupDelay = (crossStart - this.context.currentTime + xfade + 0.1) * 1000;
    window.setTimeout(() => {
      try { outSource?.stop(); } catch { /* already stopped */ }
      outSource?.disconnect();
      outGain?.disconnect();
      if (this.sources[outSlot] === outSource) this.sources[outSlot] = null;
      if (this.gains[outSlot] === outGain)   this.gains[outSlot]   = null;
    }, Math.max(cleanupDelay, 0));

    this.scheduleNextLoop(crossStart + this.regionDuration() - xfade);
  }

  // immediate = true        → hard cut (emergency stop / stopAll)
  // immediate = false       → gentle ramp; fadeDuration controls the ramp length:
  //   STOP_FADE_DURATION    → PLAY button / timer auto-stop (0.75 s)
  //   TRACK_SWITCH_FADE     → outgoing crossfade when user taps a new title (1.5 s)
  pause(immediate = false, fadeDuration = STOP_FADE_DURATION) {
    this.isPlaying = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const ctx = this.context;
    const now = ctx.currentTime;
    this.trackGain.gain.cancelScheduledValues(now);
    const fromGain = this.trackGain.gain.value;

    if (immediate || fromGain <= 0.001) {
      // Hard cut — stop sources immediately and clamp gain to 0.
      for (let i = 0; i < 2; i++) {
        try { this.sources[i]?.stop(); } catch { /* already stopped */ }
        this.sources[i]?.disconnect();
        this.gains[i]?.disconnect();
        this.sources[i] = null;
        this.gains[i]   = null;
      }
      this.trackGain.gain.setValueAtTime(0, now);
      return;
    }

    // Gentle ramp to silence.
    this.trackGain.gain.setValueAtTime(fromGain, now);
    this.trackGain.gain.linearRampToValueAtTime(0, now + fadeDuration);

    // Null refs immediately so a quick re-play() gets clean nodes.
    const fadeSources = this.sources.slice() as (AudioBufferSourceNode | null)[];
    const fadeGains   = this.gains.slice()   as (GainNode | null)[];
    for (let i = 0; i < 2; i++) {
      this.sources[i] = null;
      this.gains[i]   = null;
    }

    setTimeout(() => {
      for (let i = 0; i < 2; i++) {
        try { fadeSources[i]?.stop(); } catch { /* already stopped */ }
        fadeSources[i]?.disconnect();
        fadeGains[i]?.disconnect();
      }
      try {
        this.trackGain.gain.cancelScheduledValues(ctx.currentTime);
        this.trackGain.gain.setValueAtTime(0, ctx.currentTime);
      } catch { /* context may be closed/suspended */ }
    }, (fadeDuration + 0.15) * 1000);
  }

  setVolume(vol: number) {
    this.volume = vol;
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

// ─────────────────────────────────────────────────────────────────────────────
// useAudioEngine hook
// ─────────────────────────────────────────────────────────────────────────────
export function useAudioEngine(): AudioEngineState {
  const [tracksState, setTracksState] = useState<Record<string, TrackState>>(
    TRACKS.reduce((acc, t) => ({
      ...acc,
      [t.id]: { isPlaying: false, isLoading: false, hasError: false, volume: 0.5 }
    }), {})
  );
  const [masterVolume, setMasterVolumeState] = useState(0.8);

  const contextRef      = useRef<AudioContext | null>(null);
  const masterGainRef   = useRef<GainNode | null>(null);
  const fadeGainRef     = useRef<GainNode | null>(null);
  const eqFiltersRef    = useRef<BiquadFilterNode[]>([]);
  const pendingEqRef    = useRef<number[]>([0, 0, 0, 0, 0]);
  const enginesRef      = useRef<Record<string, TrackEngine>>({});
  const lastPlayedIdRef = useRef<string | null>(null);
  const wakeLockRef     = useRef<WakeLockSentinel | null>(null);
  const keepAliveRef    = useRef<HTMLAudioElement | null>(null);
  const masterVolumeRef = useRef<number>(0.8);
  // Stable refs for MediaSession callbacks — avoid stale closures
  const playRef         = useRef<((id: string) => Promise<void>) | null>(null);
  const pauseRef        = useRef<((id: string) => void) | null>(null);
  const resumeRef       = useRef<(() => Promise<void>) | null>(null);

  // ── Wake Lock (Android Chrome) ─────────────────────────────────────────
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); }
    catch { /* not supported or denied */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // ── Silent keep-alive: prevents iOS from suspending the AudioContext ────
  // A looping near-silent HTMLAudioElement keeps the iOS audio session alive
  // so the Web Audio context continues running when the screen locks.
  const startKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      if (keepAliveRef.current.paused) keepAliveRef.current.play().catch(() => {});
      return;
    }
    try {
      const sampleRate = 8000;
      const numSamples = sampleRate / 2;
      const dataSize   = numSamples;
      const header     = new Uint8Array(44);
      const dv         = new DataView(header.buffer);
      const wr32 = (o: number, v: number) => dv.setUint32(o, v, true);
      const wr16 = (o: number, v: number) => dv.setUint16(o, v, true);
      const str  = (o: number, s: string) => s.split('').forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF'); wr32(4, 36 + dataSize);
      str(8, 'WAVE'); str(12, 'fmt '); wr32(16, 16);
      wr16(20, 1); wr16(22, 1);
      wr32(24, sampleRate); wr32(28, sampleRate);
      wr16(32, 1); wr16(34, 8);
      str(36, 'data'); wr32(40, dataSize);
      const data = new Uint8Array(numSamples).fill(128);
      const url  = URL.createObjectURL(new Blob([header, data], { type: 'audio/wav' }));
      const el   = new Audio(url);
      el.loop    = true;
      el.volume  = 0.001;
      // Resume suspended context on each tick — handles iOS lock-screen cases
      el.addEventListener('timeupdate', () => {
        const ctx = contextRef.current;
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      });
      el.play().catch(() => {});
      keepAliveRef.current = el;
    } catch { /* no Blob/Audio support */ }
  }, []);

  // ── Background preloader ────────────────────────────────────────────────
  const preloadInBackground = useCallback(() => {
    const ctx = contextRef.current;
    const mg  = masterGainRef.current;
    if (!ctx || !mg) return;
    const unloaded = TRACKS.filter(t => !enginesRef.current[t.id]);
    let i = 0;
    const loadNext = () => {
      if (i >= unloaded.length) return;
      const track = unloaded[i++];
      const engine = new TrackEngine(track, ctx, mg);
      engine.setVolume(0.5);
      enginesRef.current[track.id] = engine;
      engine.load().catch(() => {}).finally(() => setTimeout(loadNext, 200));
    };
    setTimeout(loadNext, 800);
  }, []);

  // ── AudioContext init ───────────────────────────────────────────────────
  const initContext = useCallback(() => {
    if (!contextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      contextRef.current = new Ctx();
      masterGainRef.current = contextRef.current.createGain();
      masterGainRef.current.gain.value = masterVolume;
      fadeGainRef.current = contextRef.current.createGain();
      fadeGainRef.current.gain.value = 1.0;
      // Build 5-band peaking EQ chain and apply any pending gains.
      const filters = EQ_FREQUENCIES.map((freq, i) => {
        const f = contextRef.current!.createBiquadFilter();
        f.type = "peaking";
        f.frequency.value = freq;
        f.Q.value = EQ_Q_VALUES[i];
        f.gain.value = pendingEqRef.current[i] ?? 0;
        return f;
      });
      eqFiltersRef.current = filters;
      // Chain: masterGain → eq[0..4] → fadeGain → destination
      let prev: AudioNode = masterGainRef.current;
      for (const f of filters) { prev.connect(f); prev = f; }
      prev.connect(fadeGainRef.current);
      fadeGainRef.current.connect(contextRef.current.destination);
      setTimeout(preloadInBackground, 0);
    }
    if (contextRef.current.state === 'suspended') {
      contextRef.current.resume().catch(() => {});
    }
    startKeepAlive();
  }, [masterVolume, startKeepAlive, preloadInBackground]);

  // ── Playback controls ───────────────────────────────────────────────────
  const play = useCallback(async (trackId: string) => {
    initContext();
    const ctx = contextRef.current!;
    const mg  = masterGainRef.current!;

    const track = TRACKS.find(t => t.id === trackId);
    if (!track) return;

    // Hard-cut all other engines — immediate=true so their fade tail doesn't
    // overlap the new track's fade-in.  Covers mid-load ghost tracks too.
    Object.entries(enginesRef.current).forEach(([id, eng]) => {
      if (id !== trackId) eng.pause(true);
    });
    setTracksState(s => {
      const ns = { ...s };
      Object.keys(ns).forEach(id => { if (id !== trackId) ns[id] = { ...ns[id], isPlaying: false }; });
      return ns;
    });

    // If track previously errored, destroy stale engine for a clean fetch
    if (tracksState[trackId]?.hasError && enginesRef.current[trackId]) {
      enginesRef.current[trackId].pause(true);
      delete enginesRef.current[trackId];
    }

    if (!enginesRef.current[trackId]) {
      enginesRef.current[trackId] = new TrackEngine(track, ctx, mg);
    }

    // Guard: already playing (e.g. MediaSession re-fired) — nothing to do
    if (enginesRef.current[trackId].isPlaying) {
      lastPlayedIdRef.current = trackId;
      return;
    }

    enginesRef.current[trackId].setVolume(tracksState[trackId]?.volume ?? 0.5);

    const engine = enginesRef.current[trackId];
    lastPlayedIdRef.current = trackId;
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isLoading: true, hasError: false } }));
    try {
      await engine.load();
      // User may have tapped a different track while this was loading
      if (lastPlayedIdRef.current !== trackId) {
        setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isLoading: false } }));
        return;
      }
      // Fade out any other playing track over TRACK_SWITCH_FADE for a smooth crossfade.
      Object.entries(enginesRef.current).forEach(([id, eng]) => {
        if (id !== trackId && eng.isPlaying) eng.pause(false, TRACK_SWITCH_FADE);
      });
      engine.play();
      setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: true, isLoading: false } }));
      acquireWakeLock();
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

  const resume = useCallback(async () => {
    if (lastPlayedIdRef.current) await play(lastPlayedIdRef.current);
  }, [play]);

  const pause = useCallback((trackId: string) => {
    const engine = enginesRef.current[trackId];
    if (engine) engine.pause(false); // gentle fade — this is the PLAY button stop
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: false } }));
    releaseWakeLock();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }, [releaseWakeLock]);

  const setVolume = useCallback((trackId: string, volume: number) => {
    const engine = enginesRef.current[trackId];
    if (engine) engine.setVolume(volume);
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], volume } }));
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    masterVolumeRef.current = volume;
    setMasterVolumeState(volume);
    if (masterGainRef.current) {
      const t = contextRef.current?.currentTime ?? 0;
      masterGainRef.current.gain.cancelScheduledValues(t);
      masterGainRef.current.gain.value = volume;
    }
  }, []);

  // Apply 5 gain values (dB) to the peaking EQ filters.
  // Stores values in pendingEqRef so they're applied automatically
  // if initContext hasn't been called yet.
  const setEq = useCallback((gains: number[]) => {
    pendingEqRef.current = gains.slice(0, 5);
    eqFiltersRef.current.forEach((f, i) => {
      if (gains[i] !== undefined) f.gain.value = gains[i];
    });
  }, []);

  const stopAll = useCallback(() => {
    Object.keys(enginesRef.current).forEach(id => enginesRef.current[id].pause(true));
    setTracksState(s => {
      const ns = { ...s };
      Object.keys(ns).forEach(id => { ns[id] = { ...ns[id], isPlaying: false }; });
      return ns;
    });
    releaseWakeLock();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }, [releaseWakeLock]);

  const startFadeOut = useCallback((durationSeconds: number) => {
    const fg  = fadeGainRef.current;
    const ctx = contextRef.current;
    if (!fg || !ctx) return;
    const now = ctx.currentTime;
    fg.gain.cancelScheduledValues(now);
    fg.gain.setValueAtTime(1.0, now);
    fg.gain.linearRampToValueAtTime(0.0001, now + durationSeconds);
  }, []);

  const cancelFade = useCallback(() => {
    const fg  = fadeGainRef.current;
    const ctx = contextRef.current;
    if (!fg || !ctx) return;
    const t = ctx.currentTime;
    fg.gain.cancelScheduledValues(t);
    fg.gain.setValueAtTime(1.0, t);
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────

  useEffect(() => { playRef.current   = play;   }, [play]);
  useEffect(() => { pauseRef.current  = pause;  }, [pause]);
  useEffect(() => { resumeRef.current = resume; }, [resume]);

  // MediaSession lock-screen controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play',  () => { resumeRef.current?.(); });
    navigator.mediaSession.setActionHandler('pause', () => {
      const id = lastPlayedIdRef.current;
      if (id) pauseRef.current?.(id);
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      const id = lastPlayedIdRef.current;
      if (id) pauseRef.current?.(id);
    });
  }, []);

  // Visibility / page-lifecycle — resume AudioContext when coming to foreground.
  // No native-audio handoff: Web Audio handles background on its own with the
  // keep-alive element nudging the context back if iOS suspends it.
  useEffect(() => {
    const onVisibilityChange = () => {
      const ctx = contextRef.current;
      if (!ctx) return;
      if (document.visibilityState === 'visible') {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        startKeepAlive();
        const anyPlaying = Object.values(enginesRef.current).some(e => e.isPlaying);
        if (anyPlaying) acquireWakeLock();
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) onVisibilityChange(); // bfcache restore
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [acquireWakeLock, startKeepAlive]);

  return {
    tracks: tracksState,
    masterVolume,
    lastPlayedId: lastPlayedIdRef.current,
    play,
    pause,
    resume,
    setVolume,
    setMasterVolume,
    setEq,
    stopAll,
    startFadeOut,
    cancelFade,
  };
}
