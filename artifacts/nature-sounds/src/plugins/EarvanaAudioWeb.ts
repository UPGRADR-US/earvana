// Web fallback for EarvanaAudioPlugin — no-op stub because the web build
// uses the native Web Audio API directly via useAudioEngine.ts.
// This module is only imported when running in a browser (not Capacitor).
import { configureDevelopmentFreeview, getDevelopmentFreeview } from "../lib/developmentFreeview";
import { playbackUsage } from "../lib/playbackUsage";
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
  async configureDevelopmentFreeview({ enabled }) { return configureDevelopmentFreeview(enabled); },
  async getDevelopmentFreeview() { return getDevelopmentFreeview(); },
  async getPlaybackUsage() { return playbackUsage.snapshot(); },
  async getStatus() { return { tracks: {} }; },
  async setLastPlayed() { },
  async getLastPlayed() { return { trackId: null }; },
  async playTestTone() { },
  async stopTestTone() { },
  async setTestToneGain() { },
  async addListener() { return { remove: () => {} }; },
  async removeAllListeners() { },
};
