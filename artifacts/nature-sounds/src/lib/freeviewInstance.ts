import { developmentFreeview } from './developmentFreeview';
import { playbackUsage } from './playbackUsage';

/** One independent envelope and source list per playback instance. No legacy gains are touched. */
export class FreeviewInstance {
  readonly gain: GainNode;
  private sources: { source: AudioBufferSourceNode; start: number; end: number }[] = [];
  private deadline: number | null = null;
  private yielding = false;
  private disposed = false;
  private ownLevel = 1;
  private interrupted = false;
  private timer: number | null = null;
  private unsubscribe: () => void;
  constructor(private track: string, private context: AudioContext, output: GainNode,
              private token: object, private finished: () => void) {
    this.gain = context.createGain(); this.gain.gain.value = 1; this.gain.connect(output);
    this.unsubscribe = developmentFreeview.observe(() => this.sync());
    context.addEventListener('statechange', this.onStateChange);
  }
  private onStateChange = () => {
    // Existing context suspension/interruption wins. Re-arm only when it resumes.
    if (this.context.state !== 'running') { this.interrupted = true; this.cancelPlan(false); }
    else if (this.interrupted && developmentFreeview.reject(this.track)) {
      this.finishInstance(); // system interruption already stopped output: never restart an exhausted instance
    } else { this.interrupted = false; this.sync(); }
  };
  source(source: AudioBufferSourceNode, start: number, end: number) {
    this.sources = this.sources.filter(item => item.end > this.context.currentTime);
    this.sources.push({ source, start, end }); this.sync();
    if (this.deadline !== null) this.stopAt(source, Math.min(end, this.deadline + 1.000));
  }
  private stopAt(source: AudioBufferSourceNode, time: number) { try { source.stop(time); } catch { /* already ended */ } }
  private cancelPlan(restore: boolean) {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.deadline !== null) {
      const now = this.context.currentTime;
      const level = this.ownLevel * (now <= this.deadline ? 1 : Math.max(0, 1 - (now - this.deadline) / 1.000));
      this.gain.gain.cancelScheduledValues(now);
      this.ownLevel = restore ? 1 : level;
      this.gain.gain.setValueAtTime(this.ownLevel, now);
      // Restore natural source deadlines, never extend their originally scheduled duration.
      for (const { source, end } of this.sources) this.stopAt(source, end);
    } else if (restore && this.ownLevel !== 1) {
      this.ownLevel = 1; this.gain.gain.setValueAtTime(1, this.context.currentTime);
    }
    this.deadline = null;
    playbackUsage.previewDeadline(this.token, null);
  }
  yieldToExistingAction() {
    this.yielding = true; this.cancelPlan(false);
  }
  cancelExistingTimerFade() { this.yielding = false; this.sync(); }
  sync() {
    if (this.disposed) return;
    if (!developmentFreeview.enabled || developmentFreeview.subscribed) { this.cancelPlan(true); return; }
    // Always latch usage, even while an existing stop takes precedence.
    developmentFreeview.reject(this.track);
    if (this.yielding || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const used = playbackUsage.snapshot().secondsByTrack[this.track] ?? 0;
    const remaining = Math.max(0, 60 - used);
    // Initial source can have a 40ms scheduled lookahead; do not debit it.
    const firstStart = this.sources.length ? Math.max(now, this.sources[0].start) : now;
    const target = Math.max(now, firstStart) + remaining;
    if (this.deadline !== null) {
      // A late loop scheduler can leave real silence. Never expire from context time alone.
      if (used >= 60 || Math.abs(target - this.deadline) < 0.005) return;
      this.cancelPlan(true);
    }
    this.deadline = target;
    playbackUsage.previewDeadline(this.token, this.deadline + 1.000);
    this.gain.gain.setValueAtTime(this.ownLevel, this.deadline);
    this.gain.gain.linearRampToValueAtTime(0, this.deadline + 1.000);
    for (const { source, end } of this.sources) this.stopAt(source, Math.min(end, this.deadline + 1.000));
    this.pollCompletion();
  }
  private pollCompletion() {
    if (this.disposed || this.deadline === null || this.yielding) return;
    // Observational UI signal: existing 1s envelope midpoint, never a wall-clock delay.
    if (this.context.state === 'running' && this.context.currentTime >= this.deadline + .500 && developmentFreeview.reject(this.track)) {
      developmentFreeview.expirationMidpoint(this.track);
    }
    if (this.context.state === 'running' && this.context.currentTime >= this.deadline + 1.000) {
      if (!developmentFreeview.reject(this.track)) {
        this.cancelPlan(true); this.sync(); return;
      }
      this.finishInstance(); return;
    }
    // AudioParam/source.stop enforce audio deadlines even when this cleanup timer is throttled.
    this.timer = window.setTimeout(() => this.pollCompletion(), 20);
  }
  private finishInstance() {
    if (this.disposed) return;
    playbackUsage.tail(this.token, 0);
    this.dispose();
    for (const { source } of this.sources) { this.stopAt(source, this.context.currentTime); source.disconnect(); }
    this.finished();
  }
  dispose() {
    this.cancelPlan(false); this.disposed = true; this.unsubscribe();
    this.context.removeEventListener('statechange', this.onStateChange);
    this.gain.disconnect();
  }
}
