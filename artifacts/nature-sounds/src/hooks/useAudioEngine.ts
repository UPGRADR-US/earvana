import { useState, useRef, useCallback, useEffect } from "react";
import { TRACKS } from "../sounds";

const CROSSFADE_DURATION = 3; // seconds

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

  sourceA: AudioBufferSourceNode | null = null;
  gainA: GainNode | null = null;

  sourceB: AudioBufferSourceNode | null = null;
  gainB: GainNode | null = null;

  nextLoopTime: number = 0;
  timeoutId: number | null = null;
  isPlaying: boolean = false;

  constructor(id: string, url: string, context: AudioContext, masterGain: GainNode) {
    this.id = id;
    this.url = url;
    this.context = context;
    this.masterGain = masterGain;

    this.trackGain = this.context.createGain();
    this.trackGain.connect(this.masterGain);
    this.trackGain.gain.value = 0.5; // default volume
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

    this.sourceA = this.context.createBufferSource();
    this.sourceA.buffer = this.buffer;
    this.gainA = this.context.createGain();
    this.gainA.gain.value = 1;
    this.sourceA.connect(this.gainA);
    this.gainA.connect(this.trackGain);

    const startTime = this.context.currentTime;
    this.sourceA.start(startTime);
    
    // Schedule crossfade
    this.scheduleNextLoop(startTime + this.buffer.duration - CROSSFADE_DURATION);
  }

  scheduleNextLoop(targetTime: number) {
    if (!this.isPlaying || !this.buffer) return;

    const timeUntilNext = targetTime - this.context.currentTime;
    if (timeUntilNext > 1) {
      // Check again later if it's far
      this.timeoutId = window.setTimeout(() => this.scheduleNextLoop(targetTime), (timeUntilNext - 1) * 1000);
      return;
    }

    // Do crossfade B over A, or A over B depending on which is playing
    const isAPlaying = this.sourceA && !this.sourceB;

    const nextSource = this.context.createBufferSource();
    nextSource.buffer = this.buffer;
    const nextGain = this.context.createGain();
    nextGain.gain.setValueAtTime(0, targetTime);
    nextGain.gain.linearRampToValueAtTime(1, targetTime + CROSSFADE_DURATION);
    nextSource.connect(nextGain);
    nextGain.connect(this.trackGain);

    nextSource.start(targetTime);

    if (isAPlaying) {
      if (this.gainA) {
        this.gainA.gain.setValueAtTime(1, targetTime);
        this.gainA.gain.linearRampToValueAtTime(0, targetTime + CROSSFADE_DURATION);
      }
      this.sourceB = nextSource;
      this.gainB = nextGain;
      
      // Cleanup A
      window.setTimeout(() => {
        if (this.sourceA) {
          this.sourceA.stop();
          this.sourceA.disconnect();
          this.sourceA = null;
        }
        if (this.gainA) {
          this.gainA.disconnect();
          this.gainA = null;
        }
      }, (CROSSFADE_DURATION + timeUntilNext) * 1000);
    } else {
       if (this.gainB) {
        this.gainB.gain.setValueAtTime(1, targetTime);
        this.gainB.gain.linearRampToValueAtTime(0, targetTime + CROSSFADE_DURATION);
      }
      this.sourceA = nextSource;
      this.gainA = nextGain;

      // Cleanup B
      window.setTimeout(() => {
        if (this.sourceB) {
          this.sourceB.stop();
          this.sourceB.disconnect();
          this.sourceB = null;
        }
        if (this.gainB) {
          this.gainB.disconnect();
          this.gainB = null;
        }
      }, (CROSSFADE_DURATION + timeUntilNext) * 1000);
    }

    // Schedule next
    this.scheduleNextLoop(targetTime + this.buffer.duration - CROSSFADE_DURATION);
  }

  pause() {
    this.isPlaying = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.sourceA) {
      this.sourceA.stop();
      this.sourceA.disconnect();
      this.sourceA = null;
    }
    if (this.gainA) {
      this.gainA.disconnect();
      this.gainA = null;
    }
    if (this.sourceB) {
      this.sourceB.stop();
      this.sourceB.disconnect();
      this.sourceB = null;
    }
    if (this.gainB) {
      this.gainB.disconnect();
      this.gainB = null;
    }
  }

  setVolume(vol: number) {
    if (this.context.state === 'running') {
        this.trackGain.gain.setTargetAtTime(vol, this.context.currentTime + 0.1);
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
            masterGainRef.current.gain.setTargetAtTime(volume, contextRef.current.currentTime + 0.1);
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