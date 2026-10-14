/** One page-owned visual clock. No timers, audio clocks, or playback state are touched. */
export function blinkValues(milliseconds: number) {
  const phase = ((milliseconds % 1000) + 1000) % 1000 / 1000;
  // One-second cycle: 250ms bright hold, 250ms linear fade down,
  // 250ms dim hold, 250ms linear fade up. All consumers share this envelope.
  const dim = phase < .25 ? 0 : phase < .5 ? (phase - .25) / .25 :
    phase < .75 ? 1 : (1 - phase) / .25;
  return { dim, freeview: 1 - .5 * dim };
}
/** Explicitly started by presentation; never enables Freeview or playback. */
export function startSharedBlinkClock() {
  const owner = window as Window & { __earphoriaDevelopmentBlinkClock?: boolean };
  if (owner.__earphoriaDevelopmentBlinkClock) return;
  owner.__earphoriaDevelopmentBlinkClock = true;
  const root = document.documentElement;
  const started = performance.now();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  root.classList.add('eh-development-master-blink');
  const frame = (now: number) => {
    const value = motion.matches ? { dim: 0, freeview: 1 } : blinkValues(now - started);
    root.style.setProperty('--eh-master-dim', String(value.dim));
    root.style.setProperty('--eh-freeview-pulse', String(value.freeview));
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
}
