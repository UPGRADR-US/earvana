import { useEffect, useRef, useState } from "react";
import "./subscription-preview.css";

import type { SubscriptionOfferDisplay, SubscriptionUiCallbacks } from "../../lib/subscriptionUi";
import type { ReactNode } from "react";

type Props = SubscriptionUiCallbacks & {
  terms: string; privacy: string; variant?: "soundscape" | "ringmatch";
  offer: SubscriptionOfferDisplay | null;
  busy?: boolean; statusMessage?: ReactNode; restoreAnnotation?: string;
  accessibilityLabel?: string; purchaseAnnotation?: string;
};
/** Approved artwork presentation; no entitlement, native billing, or mock purchase dependency. */
export function SubscriptionPopup({ onDismiss: onClose, onMonthlyPurchase, onAnnualPurchase, onRestorePurchases, offer, busy = false, statusMessage, restoreAnnotation, accessibilityLabel = "Subscription plans", purchaseAnnotation = "", terms, privacy, variant = "soundscape" }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],[tabindex='0']") ?? [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 650);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const tap = (name: string) => { setFeedback(name); if (name === "MONTHLY") onMonthlyPurchase(); else onAnnualPurchase(); };
  const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;
  return <div className="eh-sub-preview-overlay" data-testid="subscription-preview">
    <img className="eh-sub-preview-scene" src={asset("homepage_BLUR_1784150009315.png")} alt=""/>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={accessibilityLabel} className={`eh-sub-preview-panel${variant === "ringmatch" ? " eh-sub-preview-ringmatch" : ""}`}>
      <img className="eh-sub-preview-art" src={asset(variant === "ringmatch" ? "C2A-window-2b.png" : "C2A-window-1d.png")} width={1474} height={2106} alt={variant === "ringmatch" ? "You’ve found your frequency! Unlock the RingMatch Lab! Select and save your ringing frequency. Discover recommended soundscapes. Explore personalized frequency-notching. Your subscription includes 40+ continuous soundscapes with superior masking and ultra-immersive audio realism." : "Relief is just a click away. Unlimited Continuous Playback. 40+ Soundscapes and Growing. Superior Masking. Ultra-Immersive Relaxation. RingMatch Tinnitus Tool."}/>
      <button className="eh-sub-preview-close" onClick={onClose} aria-label="Close subscription preview">×</button>
      <div className="eh-sub-preview-content" tabIndex={variant === "ringmatch" ? 0 : undefined} aria-label={variant === "ringmatch" ? "Subscription plans — scroll for disclosure and legal links" : undefined}>
      {variant === "ringmatch" ? <div className="eh-sub-preview-trial eh-rm-experience">
        <div className="eh-rm-experience-line"><span className="eh-rm-experience-word">Experience</span><span className="eh-rm-brand">earphoria<span className="eh-rm-trademark">™</span></span></div>
        <div className="eh-rm-free-line">{offer?.trialDuration ? <><span className="eh-rm-free-word">FREE</span> for {offer.trialDuration}</> : "Unlimited playback"}</div>
      </div> : <div className="eh-sub-preview-trial">{offer?.trialDuration ? <>Your <strong>{offer.trialDuration}</strong></> : "Experience"}<br/>of unlimited <strong>earphoria™</strong><br/><b>START HERE</b></div>}
      <div className="eh-sub-preview-plans">
        {[["MONTHLY", offer?.monthlyPrice ?? "Unavailable", "Monthly-PurchaseBox.png"], ["ANNUAL", offer?.annualPrice ?? "Unavailable", "Annual-PurchaseBox.png"]].map(([name, price, file]) => <div className="eh-sub-preview-plan" key={name}>
          <button className={`eh-sub-preview-card${feedback === name ? " is-tapped" : ""}`} disabled={!offer || busy} onClick={() => tap(name)} aria-label={`${name}, ${price}${offer?.trialDuration ? `, ${offer.trialDuration} free` : ""}${purchaseAnnotation}`}>
            <img src={asset(file)} width={658} height={302} alt=""/>
            <span><b>{name}</b><strong>{price}</strong>{variant !== "ringmatch" && offer?.cardTrialLabel && <small>{offer.cardTrialLabel}</small>}</span>
          </button>
          {name === "ANNUAL" && offer?.savingsLabel && <div className="eh-sub-preview-value">BEST VALUE{variant === "ringmatch" ? " · " : <br/>}{offer.savingsLabel}</div>}
        </div>)}
      </div>
      <div className="eh-sub-preview-bottom">
        <p>{offer?.disclosure.map((line, index) => <span key={index}>{index > 0 && <br/>}{line}</span>)}</p>
        <div className="eh-sub-preview-links"><button onClick={onRestorePurchases} disabled={busy}>Restore Purchases {restoreAnnotation && <small>{restoreAnnotation}</small>}</button><button onClick={() => setLegal("terms")}>Terms</button><button onClick={() => setLegal("privacy")}>Privacy</button></div>
        {statusMessage && <p className="eh-sub-preview-note" role="status">{statusMessage}</p>}
      </div>
      </div>
      {legal && <section className="eh-sub-preview-legal" aria-label={legal === "terms" ? "Terms of Service" : "Privacy Policy"}><button onClick={() => setLegal(null)}>Back to preview</button><h2>{legal === "terms" ? "Terms of Service" : "Privacy Policy"}</h2><div tabIndex={0}>{legal === "terms" ? terms : privacy}</div></section>}
    </div>
  </div>;
}
