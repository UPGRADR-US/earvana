import { Capacitor } from '@capacitor/core';
import { playbackUsage } from './playbackUsage';

export type DevelopmentFreeviewStatus = { enabled: boolean; available: boolean; exhaustedTrackIds: string[] };
/** Process/tab development gate, deliberately OFF by default. Never persisted as enabled. */
class DevelopmentFreeview {
  enabled = false;
  subscribed = false;
  private exhausted = new Set<string>();
  private midpointExpirations = new Set<string>();
  /** UI-only notification from the existing audio-clock fade midpoint. */
  expirationMidpoint(track: string) {
    if (this.midpointExpirations.has(track)) return;
    this.midpointExpirations.add(track);
    for (const callback of [...this.observers]) callback();
  }
  midpointExpirationTrackIds() { return [...this.midpointExpirations]; }
  private observers = new Set<() => void>();
  private timer: number | null = null;
  observe(callback: () => void) { this.observers.add(callback); return () => this.observers.delete(callback); }
  tick() {
    if (this.enabled && !this.subscribed) {
      for (const [track, seconds] of Object.entries(playbackUsage.snapshot().secondsByTrack)) {
        if (seconds >= 60) this.exhausted.add(track);
      }
    }
    for (const callback of [...this.observers]) callback();
  }
  reject(track: string) {
    if (!this.enabled || this.subscribed) return false;
    if ((playbackUsage.snapshot().secondsByTrack[track] ?? 0) >= 60) this.exhausted.add(track);
    return this.exhausted.has(track);
  }
  configure(enabled: boolean) {
    this.enabled = enabled && (Capacitor.isNativePlatform() || import.meta.env.DEV);
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = this.enabled ? window.setInterval(() => this.tick(), 50) : null;
    this.tick();
  }
  status(): DevelopmentFreeviewStatus {
    return { enabled: this.enabled, available: import.meta.env.DEV, exhaustedTrackIds: [...this.exhausted] };
  }
}
export const developmentFreeview = new DevelopmentFreeview();
export function observeFreeviewSubscription(subscribed: boolean) {
  developmentFreeview.subscribed = subscribed; developmentFreeview.tick();
}
export async function configureDevelopmentFreeview(enabled: boolean): Promise<DevelopmentFreeviewStatus> {
  if (Capacitor.isNativePlatform()) {
    const { EarvanaAudio } = await import('../plugins/EarvanaAudio');
    const status = await EarvanaAudio.configureDevelopmentFreeview({ enabled });
    developmentFreeview.configure(status.enabled); return status;
  }
  if (import.meta.env.DEV && enabled && !developmentFreeview.enabled && playbackUsage.hasActivePlayback()) {
    throw new Error('Enable development Freeview before starting playback.');
  }
  developmentFreeview.configure(import.meta.env.DEV && enabled);
  return developmentFreeview.status();
}
export async function getDevelopmentFreeview(): Promise<DevelopmentFreeviewStatus> {
  if (Capacitor.isNativePlatform()) {
    const { EarvanaAudio } = await import('../plugins/EarvanaAudio');
    const status = await EarvanaAudio.getDevelopmentFreeview();
    developmentFreeview.configure(status.enabled); return status;
  }
  return developmentFreeview.status();
}
// Explicit developer-console control; native release bridges and production web refuse enablement.
if (import.meta.env.DEV) {
(window as Window & { EarphoriaDevelopmentFreeview?: unknown }).EarphoriaDevelopmentFreeview = {
  setEnabled: configureDevelopmentFreeview, getStatus: getDevelopmentFreeview,
};
}

export function isFreeviewExhaustion(error: unknown): boolean {
  return (typeof error === 'object' && error !== null && 'code' in error && error.code === 'FREEVIEW_EXHAUSTED') ||
    /FREEVIEW_EXHAUSTED|Freeview allowance exhausted/i.test(String(error));
}
