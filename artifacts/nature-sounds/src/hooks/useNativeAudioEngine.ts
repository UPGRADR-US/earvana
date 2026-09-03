import { useState, useRef, useCallback, useEffect } from "react";
import { EarvanaAudio } from "../plugins/EarvanaAudio";
import { TRACKS, SoundTrack } from "../sounds";

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
  notchedFreq: number | null;
  setNotch: (freq: number | null) => void;
  boostedFreq: number | null;
  setBoost: (freq: number | null) => void;
};

export function useNativeAudioEngine(): AudioEngineState {
  const [tracksState, setTracksState] = useState<Record<string, TrackState>>(
    TRACKS.reduce((acc, t) => ({
      ...acc,
      [t.id]: { isPlaying: false, isLoading: false, hasError: false, volume: t.defaultVolume ?? 0.5 }
    }), {})
  );

  const [masterVolume, setMasterVolumeState] = useState(0.8);
  const savedNotch = localStorage.getItem("tr_notch_freq");
  const [notchedFreq, setNotchedFreqState] = useState<number | null>(
    savedNotch ? Number(savedNotch) : null
  );
  const notchedFreqRef = useRef<number | null>(savedNotch ? Number(savedNotch) : null);

  const savedBoost = localStorage.getItem("tr_boost_freq");
  const [boostedFreq, setBoostedFreqState] = useState<number | null>(
    savedBoost ? Number(savedBoost) : null
  );
  const boostedFreqRef = useRef<number | null>(savedBoost ? Number(savedBoost) : null);

  const lastPlayedIdRef = useRef<string | null>(null);
  const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);
  const masterVolumeRef = useRef<number>(0.8);

  // Listen for native status-change events from the plugin
  useEffect(() => {
    let listenerHandle: any;
    EarvanaAudio.addListener("statusChange", (data) => {
      const status = data.tracks as Record<string, any>;
      setTracksState(prev => {
        const next = { ...prev };
        const reported = new Set(Object.keys(status));
        for (const [id, st] of Object.entries(status)) {
          next[id] = {
            isPlaying: st["isPlaying"] as boolean,
            isLoading: st["isLoading"] as boolean,
            hasError: st["hasError"] as boolean,
            volume: st["volume"] as number,
          };
        }
        // Native only reports the active track (or {} after stopAll).
        // Clear isPlaying on anything not in the report so React can't lag behind AVAudioEngine.
        for (const id of Object.keys(next)) {
          if (!reported.has(id) && next[id].isPlaying) {
            next[id] = { ...next[id], isPlaying: false };
          }
        }
        return next;
      });
    }).then(handle => { listenerHandle = handle; });

    return () => {
      if (listenerHandle) {
        listenerHandle.remove?.();
      }
      EarvanaAudio.removeAllListeners().catch(() => {});
    };
  }, []);

  // Restore EQ / notch / boost on mount
  useEffect(() => {
    const eqBands = localStorage.getItem("tr_eq_bands");
    if (eqBands) {
      try {
        const arr = JSON.parse(eqBands);
        if (Array.isArray(arr) && arr.length === 5) {
          EarvanaAudio.setEq({ gains: arr.map((v: any) => Number(v)) });
        }
      } catch { /* ignore */ }
    }
    if (notchedFreqRef.current != null) {
      EarvanaAudio.setNotch({ freq: notchedFreqRef.current });
    }
    if (boostedFreqRef.current != null) {
      EarvanaAudio.setBoost({ freq: boostedFreqRef.current });
    }
  }, []);

  const play = useCallback(async (trackId: string) => {
    const track = TRACKS.find(t => t.id === trackId);
    if (!track) return;

    // Stop other tracks via plugin
    Object.entries(tracksState).forEach(([id, st]) => {
      if (id !== trackId && st.isPlaying) {
        EarvanaAudio.pause({ trackId: id }).catch(() => {});
      }
    });
    setTracksState(s => {
      const ns = { ...s };
      Object.keys(ns).forEach(id => { if (id !== trackId) ns[id] = { ...ns[id], isPlaying: false }; });
      return ns;
    });

    lastPlayedIdRef.current = trackId;
    setLastPlayedId(trackId);
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isLoading: true, hasError: false } }));

    try {
      // On native iOS this hits AVAudioEngine (EarvanaAudioPlugin), not Web Audio.
      const volume = tracksState[trackId]?.volume ?? track.defaultVolume ?? 0.5;
      await EarvanaAudio.play({
        trackId,
        filePath: track.file,
        loopStart: track.loopStart ?? 0,
        loopEnd: track.loopEnd,
        crossfadeDuration: track.crossfadeDuration ?? 40,
        volume,
      });
      setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: true, isLoading: false } }));
    } catch (e) {
      console.error("[NativeAudio] play failed", e);
      const premiumBlocked = /PREMIUM_REQUIRED/i.test(String(e));
      setTracksState(s => ({
        ...s,
        [trackId]: { ...s[trackId], isLoading: false, hasError: !premiumBlocked, isPlaying: false },
      }));
    }
  }, [tracksState]);

  const resume = useCallback(async () => {
    if (lastPlayedIdRef.current) {
      await play(lastPlayedIdRef.current);
    } else {
      await EarvanaAudio.resume();
    }
  }, [play]);

  const pause = useCallback((trackId: string) => {
    EarvanaAudio.pause({ trackId }).catch(() => {});
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], isPlaying: false } }));
  }, []);

  const setVolume = useCallback((trackId: string, volume: number) => {
    EarvanaAudio.setVolume({ trackId, volume }).catch(() => {});
    setTracksState(s => ({ ...s, [trackId]: { ...s[trackId], volume } }));
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    masterVolumeRef.current = volume;
    setMasterVolumeState(volume);
    EarvanaAudio.setMasterVolume({ volume }).catch(() => {});
  }, []);

  const setEq = useCallback((gains: number[]) => {
    const arr = gains.slice(0, 5).map(Number);
    EarvanaAudio.setEq({ gains: arr }).catch(() => {});
  }, []);

  const stopAll = useCallback(() => {
    EarvanaAudio.stopAll().catch(() => {});
    setTracksState(s => {
      const ns = { ...s };
      Object.keys(ns).forEach(id => { ns[id] = { ...ns[id], isPlaying: false }; });
      return ns;
    });
  }, []);

  const startFadeOut = useCallback((durationSeconds: number) => {
    EarvanaAudio.startFadeOut({ durationSeconds }).catch(() => {});
  }, []);

  const cancelFade = useCallback(() => {
    EarvanaAudio.cancelFade().catch(() => {});
  }, []);

  const setNotch = useCallback((freq: number | null) => {
    notchedFreqRef.current = freq;
    setNotchedFreqState(freq);
    if (freq != null) {
      EarvanaAudio.setNotch({ freq }).catch(() => {});
      localStorage.setItem("tr_notch_freq", String(freq));
    } else {
      EarvanaAudio.setNotch({}).catch(() => {});
      localStorage.removeItem("tr_notch_freq");
    }
  }, []);

  const setBoost = useCallback((freq: number | null) => {
    boostedFreqRef.current = freq;
    setBoostedFreqState(freq);
    if (freq != null) {
      EarvanaAudio.setBoost({ freq }).catch(() => {});
      localStorage.setItem("tr_boost_freq", String(freq));
    } else {
      EarvanaAudio.setBoost({}).catch(() => {});
      localStorage.removeItem("tr_boost_freq");
    }
  }, []);

  return {
    tracks: tracksState,
    masterVolume,
    play,
    pause,
    resume,
    setVolume,
    setMasterVolume,
    setEq,
    stopAll,
    lastPlayedId,
    startFadeOut,
    cancelFade,
    notchedFreq,
    setNotch,
    boostedFreq,
    setBoost,
  };
}
