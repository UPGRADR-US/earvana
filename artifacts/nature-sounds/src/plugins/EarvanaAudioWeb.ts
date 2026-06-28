// Web fallback for EarvanaAudioPlugin — no-op stub because the web build
// uses the native Web Audio API directly via useAudioEngine.ts.
// This module is only imported when running in a browser (not Capacitor).
import type { EarvanaAudioPlugin } from "./EarvanaAudio";

export const EarvanaAudioWeb: EarvanaAudioPlugin = {
  async play()      { /* web uses Web Audio API */ },
  async pause()     { },
  async resume()    { },
  async setVolume() { },
  async setMasterVolume() { },
  async setEq()     { },
  async setNotch()  { },
  async setBoost()  { },
  async startFadeOut() { },
  async cancelFade() { },
  async stopAll()   { },
  async getStatus() { return { tracks: {} }; },
  async setLastPlayed() { },
  async getLastPlayed() { return { trackId: null }; },
  async addListener() { return { remove: () => {} }; },
  async removeAllListeners() { },
};
