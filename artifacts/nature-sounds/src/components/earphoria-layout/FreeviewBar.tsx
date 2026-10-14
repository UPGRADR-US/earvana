import { useEffect, useRef, type ReactNode } from "react";
import { startSharedBlinkClock } from "../../lib/sharedBlinkClock";
import type { FreeviewBarState } from "../../lib/freeviewStatus";
import "./freeview-test.css";

/** Approved presentation only; receives read-only lifecycle state and a CTA callback. */
const presentedExpirations = new Set<string>();
export function FreeviewBar({ snapshot, isPlaying, onSubscribe, children, label = "Freeview Mode" }: { snapshot: FreeviewBarState; isPlaying: boolean; onSubscribe: () => void; children?: ReactNode; label?: string }) {
  const wordsRef = useRef<HTMLSpanElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    // Already-exhausted tracks on mount are not new expiration events.
    if (!initialized.current) {
      for (const id of snapshot.midpointExpirationTrackIds) presentedExpirations.add(id);
      initialized.current = true;
      return;
    }
    const fresh = [...snapshot.midpointExpirationTrackIds].filter(id => !presentedExpirations.has(id));
    for (const id of fresh) presentedExpirations.add(id);
    const words = wordsRef.current;
    const shell = shellRef.current;
    if (!fresh.length || !words || !shell || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scale = Math.max(1, (shell.clientWidth * .9) / words.offsetWidth);
    shell.classList.remove("is-post-expiration");
    shell.classList.add("is-expiration-emphasis");
    // Preserve the sampled curve within each phase of one exact 1.5s cycle.
    const samples = [100, 101, 103, 106, 110, 115, 125, 150,
      150, 150, 149, 147, 143, 133, 120, 100];
    const sampleTime = (index: number) => {
      if (index <= 7) return index / 7 * 450;
      if (index <= 9) return 450 + (index - 7) / 2 * 300;
      return 750 + (index - 9) / 6 * 450;
    };
    const animation = words.animate([
      ...samples.map((value, index) => ({
        transform: `scale(${1 + (value - 100) / 50 * (scale - 1)})`,
        offset: sampleTime(index) / 1500,
      })),
      { transform: "scale(1)", offset: 1 }, // Final rest completes the single 1.5s cycle.
    ], { duration: 1500, easing: "linear", fill: "none" });
    animation.onfinish = () => {
      shell.classList.remove("is-expiration-emphasis");
      shell.classList.add("is-post-expiration");
    };
    // Do not cancel on snapshot updates: counting/overlap may still change.
  }, [snapshot.midpointExpirationTrackIds]);
  useEffect(() => { startSharedBlinkClock(); }, []);
  useEffect(() => () => { wordsRef.current?.getAnimations().forEach(animation => animation.cancel()); }, []);
  return <div ref={shellRef} className="eh-freeview-test-shell">
    <aside className={`eh-freeview-test-bar${isPlaying && snapshot.isCountingDown ? " is-counting-down" : ""}`} data-testid="freeview-test-bar" aria-label={label}>
      <div className="eh-freeview-art-effects"><img className="eh-freeview-bar-art eh-freeview-bar-art-v5" src={`${import.meta.env.BASE_URL}FreeviewBar-v5.png`} width={2045} height={388} alt="" draggable={false}/></div>
      <div className="eh-freeview-live-copy">
        <div className="eh-freeview-main-line"><span>Freeview Mode</span></div>
        <button className="eh-freeview-subscribe" onClick={onSubscribe}><span ref={wordsRef} className="eh-freeview-subscribe-words"><strong>Turn On</strong>{" "}<span className="eh-freeview-subscribe-light">Unlimited Playback</span></span><span className="eh-freeview-cta-arrows">»</span></button>
      </div>
    </aside>
    {children}
  </div>;
}
