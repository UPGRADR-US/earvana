import { isNativeAudio } from "../plugins/EarvanaAudio";
import { useAudioEngine as useWebAudioEngine } from "./useWebAudioEngine";
import { useNativeAudioEngine } from "./useNativeAudioEngine";

export function useAudioEngine() {
  if (isNativeAudio) {
    return useNativeAudioEngine();
  }
  return useWebAudioEngine();
}

export type { TrackState, AudioEngineState } from "./useWebAudioEngine";
