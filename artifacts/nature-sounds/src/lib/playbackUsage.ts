/** Tab-session observer. It reads audio clocks and never controls audio. */
const STORAGE_KEY = 'earphoria.playbackUsage.v1';
type Span = [number, number];
type Observation = { track: string; context: AudioContext; last: number; spans: Span[]; end: number; running: boolean; previewEnd: number };
class PlaybackUsage {
  private totals: Record<string, number> = {};
  private observations = new Map<object, Observation>();
  private watchedContexts = new WeakSet<AudioContext>();
  constructor() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
      for (const [id, value] of Object.entries(saved)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) this.totals[id] = value;
      }
    } catch { /* storage unavailable: retain memory counters */ }
    window.setInterval(() => this.flush(), 250);
    window.addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => this.flush());
  }
  private save() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.totals)); } catch { /* memory fallback */ }
  }
  flush() {
    const intervals = new Map<string, Span[]>();
    for (const [token, observation] of this.observations) {
      const now = observation.context.currentTime;
      const end = Math.min(now, observation.end, observation.previewEnd);
      // Union scheduled source intervals: internal loop overlap counts once.
      let cursor = observation.last;
      for (const [start, stop] of observation.spans.sort((a, b) => a[0] - b[0])) {
        const left = Math.max(cursor, start);
        const right = Math.min(end, stop);
        if (observation.running && right > left) {
          const spans = intervals.get(observation.track) ?? [];
          // Relative to this flush: union same-track rapid replay/remount overlap too.
          spans.push([left - now, right - now]); intervals.set(observation.track, spans);
          cursor = right;
        }
      }
      observation.last = now;
      observation.spans = observation.spans.filter(([, stop]) => stop > now);
      if (now >= observation.end) this.observations.delete(token);
    }
    for (const [track, spans] of intervals) {
      let cursor = -Infinity, elapsed = 0;
      for (const [start, stop] of spans.sort((a, b) => a[0] - b[0])) {
        if (stop > Math.max(cursor, start)) elapsed += stop - Math.max(cursor, start);
        cursor = Math.max(cursor, stop);
      }
      this.totals[track] = (this.totals[track] ?? 0) + elapsed;
    }
    this.save();
  }
  begin(token: object, track: string, context: AudioContext, start: number, stop: number) {
    this.flush();
    this.totals[track] ??= 0;
    if (!this.watchedContexts.has(context)) {
      this.watchedContexts.add(context);
      context.addEventListener('statechange', () => {
        this.flush();
        for (const observation of this.observations.values()) {
          if (observation.context === context) observation.running = context.state === 'running';
        }
      });
    }
    this.observations.set(token, { track, context, last: context.currentTime, spans: [[start, stop]], end: Infinity, running: context.state === 'running', previewEnd: Infinity });
  }
  source(token: object, start: number, stop: number) {
    this.flush(); this.observations.get(token)?.spans.push([start, stop]);
  }
  tail(token: object, seconds: number) {
    this.flush(); const observation = this.observations.get(token);
    if (observation) observation.end = Math.min(observation.end, observation.context.currentTime + Math.max(0, seconds));
    this.flush();
  }
  previewDeadline(token: object, deadline: number | null) {
    this.flush(); const observation = this.observations.get(token);
    if (observation) observation.previewEnd = deadline ?? Infinity;
  }
  hasActivePlayback() { this.flush(); return this.observations.size > 0; }
  snapshot() { this.flush(); return { secondsByTrack: { ...this.totals } }; }
}
// Survives React remounts and development module reloads; storage survives reload/BFCache.
const owner = window as Window & { __earphoriaPlaybackUsage?: PlaybackUsage };
export const playbackUsage = owner.__earphoriaPlaybackUsage ??= new PlaybackUsage();
