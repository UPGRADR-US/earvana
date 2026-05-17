import { useState, useRef, useCallback, useEffect } from "react";
import { TRACKS } from "../sounds";

const CROSSFADE_DURATION = 15; // seconds

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
  setVolume: (trackId: string, volume: number) => void;
  setMasterVolume: (volume: number) => void;
  stopAll: () => void;
};

// Represents a track's audio state
class TrackEngine {
  id: string;
  url: string;
  context: AudioContext;
  masterGain: GainNode;
  trackGain: GainNode;
  buffer: AudioBuffer | null = null;

  // Two slots ping-pong for seamless crossfade looping
  sources: [AudioBufferSourceNode | null, AudioBufferSourceNode | null] = [null, null];
  gains: [GainNode | null, GainNode | null] = [null, null];
  currentSlot: 0 | 1 = 0;

  timeoutId: number | null = null;
  isPlaying: boolean = false;

  constructor(id: string, url: string, context: AudioContext, masterGain: GainNode) {
    this.id = id;
    this.url = url;
    this.context = context;
    this.masterGain = masterGain;

    this.trackGain = this.context.createGain();
    this.trackGain.connect(this.masterGain);
    this.trackGain.gain.value = 0.5;
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
    source.start(startTime);

    this.sources[0] = source;
    this.gains[0] = gain;

    this.scheduleNextLoop(startTime + this.buffer.duration - CROSSFADE_DURATION);
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

    // Start the incoming source
    const inSource = this.context.createBufferSource();
    inSource.buffer = this.buffer;
    const inGain = this.context.createGain();
    // Clamp targetTime to now if it slipped past
    const crossStart = Math.max(targetTime, this.context.currentTime);
    inGain.gain.setValueAtTime(0, crossStart);
    inGain.gain.linearRampToValueAtTime(1, crossStart + CROSSFADE_DURATION);
    inSource.connect(inGain);
    inGain.connect(this.trackGain);
    inSource.start(crossStart);

    // Fade out the outgoing source
    const outGain = this.gains[outSlot];
    const outSource = this.sources[outSlot];
    if (outGain) {
      outGain.gain.setValueAtTime(outGain.gain.value, crossStart);
      outGain.gain.linearRampToValueAtTime(0, crossStart + CROSSFADE_DURATION);
    }

    // Store incoming in the new slot
    this.sources[inSlot] = inSource;
    this.gains[inSlot] = inGain;
    this.currentSlot = inSlot;

    // Clean up outgoing after crossfade completes
    const cleanupDelay = (crossStart - this.context.currentTime + CROSSFADE_DURATION + 0.1) * 1000;
    window.setTimeout(() => {
      try { outSource?.stop(); } catch { /* already stopped */ }
      outSource?.disconnect();
      outGain?.disconnect();
      if (this.sources[outSlot] === outSource) this.sources[outSlot] = null;
      if (this.gains[outSlot] === outGain) this.gains[outSlot] = null;
    }, Math.max(cleanupDelay, 0));

    // Schedule the next crossfade
    this.scheduleNextLoop(crossStart + this.buffer.duration - CROSSFADE_DURATION);
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
    if (this.context.state === 'running') {
      this.trackGain.gain.setTargetAtTime(vol, this.context.currentTime, 0.1);
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

  const contextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const enginesRef = useRef<Record<string, TrackEngine>>({});

  const initContext = useCallback(() => {
    if (!contextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      contextRef.current = new Ctx();
      masterGainRef.current = contextRef.current.createGain();
      masterGainRef.current.gain.value = masterVolume;
      masterGainRef.current.connect(contextRef.current.destination);
    }
    if (contextRef.current.state === "suspended") {
      contextRef.current.resume();
    }
  }, [masterVolume]);

  const play = useCallback(async (trackId: string) => {
    initContext();
    const ctx = contextRef.current!;
    const mg = masterGainRef.current!;

    const track = TRACKS.find(t => t.id === trackId);
    if (!track) return;

    if (!enginesRef.current[trackId]) {
      enginesRef.current[trackId] = new TrackEngine(trackId, track.file, ctx, mg);
      enginesRef.current[trackId].setVolume(tracksState[trackId].volume);
    }

    const engine = enginesRef.current[trackId];

    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isLoading: true, hasError: false } }));
    try {
      await engine.load();
      engine.play();
      setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: true, isLoading: false } }));
    } catch (e) {
      console.error("Failed to play track", e);
      setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isLoading: false, hasError: true } }));
    }
  }, [initContext, tracksState]);

  const pause = useCallback((trackId: string) => {
    const engine = enginesRef.current[trackId];
    if (engine) {
      engine.pause();
    }
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: false } }));
  }, []);

  const setVolume = useCallback((trackId: string, volume: number) => {
    const engine = enginesRef.current[trackId];
    if (engine) {
      engine.setVolume(volume);
    }
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], volume } }));
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    setMasterVolumeState(volume);
    if (masterGainRef.current && contextRef.current) {
        if (contextRef.current.state === 'running') {
            masterGainRef.current.gain.setTargetAtTime(volume, contextRef.current.currentTime, 0.1);
        } else {
            masterGainRef.current.gain.value = volume;
        }
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
  }, []);

  return {
    tracks: tracksState,
    masterVolume,
    play,
    pause,
    setVolume,
    setMasterVolume,
    stopAll
  };
}