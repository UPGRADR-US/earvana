import { useState, useRef, useCallback, useEffect } from "react";
import { TRACKS, SoundTrack } from "../sounds";

const DEFAULT_CROSSFADE  = 15;  // seconds
const FADE_IN_DURATION   = 5;   // seconds


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
  stopAll: () => void;
  lastPlayedId: string | null;
  startFadeOut: (durationSeconds: number) => void;
  cancelFade: () => void;
};

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

  timeoutId: number | null = null;
  isPlaying: boolean = false;
  volume: number = 0.5;

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
    this.trackGain.gain.cancelScheduledValues(startTime);
    this.trackGain.gain.setValueAtTime(0, startTime);
    const fadeInScaled = EQUAL_POWER_IN.map(v => v * this.volume);
    this.trackGain.gain.setValueCurveAtTime(fadeInScaled, startTime, FADE_IN_DURATION);

    source.start(startTime, this.loopStart, this.regionDuration());
    this.sources[0] = source;
    this.gains[0] = gain;
    this.scheduleNextLoop(startTime + this.regionDuration() - this.crossfadeDuration);
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
    const xfade = this.crossfadeDuration;

    const inSource = this.context.createBufferSource();
    inSource.buffer = this.buffer;
    const inGain = this.context.createGain();
    const crossStart = Math.max(targetTime, this.context.currentTime);
    inGain.gain.setValueAtTime(0, crossStart);
    inGain.gain.setValueCurveAtTime(EQUAL_POWER_IN, crossStart, xfade);
    inSource.connect(inGain);
    inGain.connect(this.trackGain);
    inSource.start(crossStart, this.loopStart, this.regionDuration());

    const outGain = this.gains[outSlot];
    const outSource = this.sources[outSlot];
    if (outGain) {
      outGain.gain.setValueAtTime(outGain.gain.value, crossStart);
      outGain.gain.setValueCurveAtTime(EQUAL_POWER_OUT, crossStart, xfade);
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
      if (this.gains[outSlot] === outGain) this.gains[outSlot] = null;
    }, Math.max(cleanupDelay, 0));

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
  // ── State ────────────────────────────────────────────────────────────────
  const [tracksState, setTracksState] = useState<Record<string, TrackState>>(
    TRACKS.reduce((acc, t) => ({
      ...acc,
      [t.id]: { isPlaying: false, isLoading: false, hasError: false, volume: 0.5 }
    }), {})
  );
  const [masterVolume, setMasterVolumeState] = useState(0.8);

  // ── Refs — ALL declared before any useCallback / useEffect ───────────────
  const contextRef      = useRef<AudioContext | null>(null);
  const masterGainRef   = useRef<GainNode | null>(null);
  const fadeGainRef     = useRef<GainNode | null>(null);
  const enginesRef      = useRef<Record<string, TrackEngine>>({});
  const lastPlayedIdRef = useRef<string | null>(null);
  const wakeLockRef     = useRef<WakeLockSentinel | null>(null);
  const keepAliveRef    = useRef<HTMLAudioElement | null>(null);
  // Per-track pre-unlocked <audio> elements for iOS background handoff
  const bgAudioRef      = useRef<Record<string, HTMLAudioElement>>({});
  const masterVolumeRef = useRef<number>(0.8);
  // Stable refs for MediaSession callbacks (avoid stale closures)
  const playRef         = useRef<((id: string) => Promise<void>) | null>(null);
  const pauseRef        = useRef<((id: string) => void) | null>(null);
  const resumeRef       = useRef<(() => Promise<void>) | null>(null);

  // ── Wake Lock (Android Chrome) ───────────────────────────────────────────
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); }
    catch { /* not supported or denied */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // ── iOS keep-alive: silent HTMLAudioElement keeps audio session active ───
  // iOS Safari suspends the Web Audio API when the screen locks unless an
  // HTMLAudioElement is actively playing a real audio src (not a stream —
  // srcObject/MediaStreamDestination is NOT supported on iOS Safari).
  // We build a minimal silent WAV in memory, turn it into a blob URL, and
  // loop it at near-zero volume. iOS treats this as a live audio session and
  // keeps the Web Audio context running in the background.
  const startKeepAlive = useCallback(() => {
    // If already created, just make sure it's playing
    if (keepAliveRef.current) {
      if (keepAliveRef.current.paused) keepAliveRef.current.play().catch(() => {});
      return;
    }
    try {
      // Build a minimal silent WAV: 8000 Hz, mono, 8-bit PCM, 0.5 s
      const sampleRate = 8000;
      const numSamples = sampleRate / 2;          // 0.5 seconds
      const dataSize   = numSamples;               // 1 byte per sample (8-bit)
      const header     = new Uint8Array(44);
      const dv         = new DataView(header.buffer);
      const wr32 = (o: number, v: number) => dv.setUint32(o, v, true);
      const wr16 = (o: number, v: number) => dv.setUint16(o, v, true);
      const str  = (o: number, s: string) => s.split('').forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
      str(0,  'RIFF'); wr32(4, 36 + dataSize);
      str(8,  'WAVE'); str(12, 'fmt '); wr32(16, 16);
      wr16(20, 1);           // PCM
      wr16(22, 1);           // mono
      wr32(24, sampleRate);  // sample rate
      wr32(28, sampleRate);  // byte rate (= sampleRate × 1 channel × 1 byte)
      wr16(32, 1);           // block align
      wr16(34, 8);           // bits per sample
      str(36, 'data'); wr32(40, dataSize);
      const data = new Uint8Array(numSamples).fill(128); // 128 = silence in 8-bit unsigned PCM
      const url  = URL.createObjectURL(new Blob([header, data], { type: 'audio/wav' }));

      const el  = new Audio(url);
      el.loop   = true;
      el.volume = 0.001;   // near-silent but non-zero — iOS skips muted elements

      // If iOS pauses us in background, fight back immediately
      el.addEventListener('pause', () => { el.play().catch(() => {}); });

      // Each timeupdate tick (fires ~4×/s while playing) nudges a suspended
      // AudioContext back to running — critical for iOS background playback
      el.addEventListener('timeupdate', () => {
        const ctx = contextRef.current;
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      });

      el.play().catch(() => {});
      keepAliveRef.current = el;
    } catch { /* graceful degradation on browsers without Blob/Audio support */ }
  }, []);

  // ── AudioContext init ────────────────────────────────────────────────────
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
    startKeepAlive();
  }, [masterVolume, startKeepAlive]);

  // ── Playback controls ────────────────────────────────────────────────────
  const play = useCallback(async (trackId: string) => {
    initContext();
    const ctx = contextRef.current!;
    const mg  = masterGainRef.current!;

    const track = TRACKS.find(t => t.id === trackId);
    if (!track) return;

    Object.entries(enginesRef.current).forEach(([id, eng]) => {
      if (id !== trackId && eng.isPlaying) eng.pause();
    });
    setTracksState(s => {
      const ns = { ...s };
      Object.keys(ns).forEach(id => { if (id !== trackId) ns[id] = { ...ns[id], isPlaying: false }; });
      return ns;
    });

    // If track previously errored, destroy the stale engine so we get a clean fetch
    if (tracksState[trackId]?.hasError && enginesRef.current[trackId]) {
      enginesRef.current[trackId].pause();
      delete enginesRef.current[trackId];
    }

    if (!enginesRef.current[trackId]) {
      enginesRef.current[trackId] = new TrackEngine(track, ctx, mg);
      enginesRef.current[trackId].setVolume(tracksState[trackId]?.volume ?? 0.5);
    }

    const engine = enginesRef.current[trackId];
    lastPlayedIdRef.current = trackId;
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isLoading: true, hasError: false } }));
    try {
      await engine.load();
      engine.play();
      setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: true, isLoading: false } }));
      acquireWakeLock();
      // Pre-unlock a background <audio> element for this track while we're still
      // inside a user-gesture context — iOS requires this so we can call .play()
      // from the visibilitychange handler without a new gesture.
      if (!bgAudioRef.current[trackId]) {
        const bgEl = new Audio(import.meta.env.BASE_URL + track.file);
        bgEl.loop    = true;
        bgEl.preload = 'auto';
        bgEl.play().then(() => bgEl.pause()).catch(() => {});
        bgAudioRef.current[trackId] = bgEl;
      }
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
    if (engine) engine.pause();
    const bgEl = bgAudioRef.current[trackId];
    if (bgEl && !bgEl.paused) bgEl.pause();
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

  const stopAll = useCallback(() => {
    Object.keys(enginesRef.current).forEach(id => enginesRef.current[id].pause());
    Object.values(bgAudioRef.current).forEach(el => { if (!el.paused) el.pause(); });
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

  // ── Effects ──────────────────────────────────────────────────────────────

  // Keep stable refs current so MediaSession handlers never hold stale closures
  useEffect(() => { playRef.current   = play;   }, [play]);
  useEffect(() => { pauseRef.current  = pause;  }, [pause]);
  useEffect(() => { resumeRef.current = resume; }, [resume]);

  // Wire MediaSession lock-screen controls once on mount
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play',  () => { resumeRef.current?.(); });
    navigator.mediaSession.setActionHandler('pause', () => {
      const id = lastPlayedIdRef.current;
      if (id) pauseRef.current?.(id);
    });
    navigator.mediaSession.setActionHandler('stop',  () => {
      const id = lastPlayedIdRef.current;
      if (id) pauseRef.current?.(id);
    });
  }, []);

  // iOS background audio handoff.
  //
  // iOS Safari suspends AudioContext when the page is hidden and will NOT allow
  // ctx.resume() from a non-visible page — even with an active audio session.
  // The only audio iOS lets continue in background is a native <audio> element
  // that was already playing before the page was hidden.
  //
  // Strategy:
  //   hidden  → hand off to pre-unlocked <audio> elements (loop=true, no WebAudio)
  //   visible → stop <audio> elements, resume AudioContext (WebAudio takes over)
  //
  // The <audio> elements are pre-unlocked inside play() while we're still in a
  // user-gesture context, so iOS allows .play() here without a new gesture.
  useEffect(() => {
    const onVisibilityChange = () => {
      const ctx = contextRef.current;
      const engines = enginesRef.current;

      if (document.visibilityState === 'hidden') {
        const mv = masterVolumeRef.current;
        Object.entries(engines).forEach(([id, eng]) => {
          if (!eng.isPlaying) return;
          const bgEl = bgAudioRef.current[id];
          if (!bgEl) return;
          bgEl.volume = Math.min(1, Math.max(0, eng.volume * mv));
          bgEl.play().catch(() => {});
        });
      } else {
        // visible / bfcache restore — Web Audio takes back over
        Object.values(bgAudioRef.current).forEach(el => { if (!el.paused) el.pause(); });
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        startKeepAlive();
        const anyPlaying = Object.values(engines).some(e => e.isPlaying);
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
    stopAll,
    startFadeOut,
    cancelFade,
  };
}
