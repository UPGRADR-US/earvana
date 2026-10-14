/** Read-only transport contract. Native playback remains the authority; this creates no counters. */
export interface FreeviewTrackStatus {
  readonly remainingSeconds: number;
  readonly hasBeenPlayed: boolean;
  readonly exhausted: boolean;
  readonly expirationPhase: 'none' | 'fading' | 'stopped';
}
export interface FreeviewLifecycleSignal {
  /** Stable event identity, retained in snapshots across UI remounts. */
  readonly id: string;
  readonly trackId: string;
  readonly playbackInstanceId: string;
  readonly phase: 'expiration-started' | 'expiration-midpoint' | 'expiration-stopped';
}
export interface FreeviewStatus {
  readonly sessionId: string;
  readonly enabled: boolean;
  readonly subscriberStatus: 'loading' | 'active' | 'inactive' | 'unknown';
  readonly selectedTrackId: string | null;
  readonly activeTrackId: string | null;
  readonly playbackState: 'loading' | 'playing' | 'paused' | 'stopped' | 'interrupted';
  readonly tracks: Readonly<Record<string, FreeviewTrackStatus>>;
  readonly lifecycle: readonly FreeviewLifecycleSignal[];
}
export interface FreeviewBarState {
  readonly isCountingDown: boolean;
  /** Session-qualified lifecycle IDs, not timestamps or locally scheduled delays. */
  readonly midpointExpirationTrackIds: ReadonlySet<string>;
}
export function formatRemainingAllowance(seconds: number): string {
  return `:${String(Math.ceil(Math.max(0, Math.min(60, seconds)))).padStart(2, '0')}`;
}
/** Presentation projection only. Never integrates elapsed time or mutates entitlement. */
export function freeviewBarState(status: FreeviewStatus): FreeviewBarState | null {
  if (!status.enabled || status.subscriberStatus !== 'inactive') return null;
  const active = status.activeTrackId ? status.tracks[status.activeTrackId] : undefined;
  return {
    isCountingDown: status.playbackState === 'playing' && !!active && !active.exhausted && active.remainingSeconds > 0,
    midpointExpirationTrackIds: new Set(status.lifecycle.filter(signal => signal.phase === 'expiration-midpoint').map(signal => `${status.sessionId}:${signal.id}`)),
  };
}
