import { Capacitor, registerPlugin } from "@capacitor/core";

export interface EarvanaAudioPlugin {
  play(options: { trackId: string; filePath: string }): Promise<void>;
  pause(options: { trackId: string }): Promise<void>;
  resume(): Promise<void>;
  setVolume(options: { trackId: string; volume: number }): Promise<void>;
  setMasterVolume(options: { volume: number }): Promise<void>;
  setEq(options: { gains: number[] }): Promise<void>;
  setNotch(options: { freq?: number }): Promise<void>;
  setBoost(options: { freq?: number }): Promise<void>;
  startFadeOut(options: { durationSeconds: number }): Promise<void>;
  cancelFade(): Promise<void>;
  stopAll(): Promise<void>;
  getStatus(): Promise<{ tracks: Record<string, { isPlaying: boolean; isLoading: boolean; hasError: boolean; volume: number }> }>;
  setLastPlayed(options: { trackId: string }): Promise<void>;
  getLastPlayed(): Promise<{ trackId: string | null }>;
  addListener(eventName: "statusChange", listenerFunc: (data: { tracks: Record<string, any> }) => void): Promise<any>;
  removeAllListeners(): Promise<void>;
}

const EarvanaAudio = registerPlugin<EarvanaAudioPlugin>("EarvanaAudio", {
  web: () => import("./EarvanaAudioWeb").then(m => m.EarvanaAudioWeb),
});

export { EarvanaAudio };
export const isNativeAudio = Capacitor.isNativePlatform();
