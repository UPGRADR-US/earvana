import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SubscriptionPopup } from "./SubscriptionPopup";
import type { SubscriptionOfferDisplay } from "../../lib/subscriptionUi";

const previewOffer: SubscriptionOfferDisplay = {
  monthlyPrice: "$4.99/mo", annualPrice: "$39.99/yr", trialDuration: "7 days",
  cardTrialLabel: "7 DAYS FREE", savingsLabel: "SAVE 33%",
  disclosure: ["No charge today. Cancel anytime.", "Subscription automatically renews at the selected price", "after your free trial."],
};
/** Local display-only adapter; never renders in production or native builds. */
export function SubscriptionPreview({ onClose, terms, privacy, variant = "soundscape" }: { onClose: () => void; terms: string; privacy: string; variant?: "soundscape" | "ringmatch" }) {
  const [plan, setPlan] = useState<string | null>(null);
  if (!import.meta.env.DEV || Capacitor.isNativePlatform()) return null;
  const feedback = plan === "MONTHLY" || plan === "ANNUAL" ? `${plan} tapped — no purchase made.` : plan;
  const statusMessage = variant === "ringmatch" ? <>{feedback && <>{feedback}<br/></>}Development preview only · provisional offer.</> : <>{feedback ?? "Development preview only"}<br/>Provisional prices, savings and trial. Store offer not verified.</>;
  return <SubscriptionPopup variant={variant} terms={terms} privacy={privacy} offer={previewOffer}
    onDismiss={onClose} onMonthlyPurchase={() => setPlan("MONTHLY")} onAnnualPurchase={() => setPlan("ANNUAL")}
    onRestorePurchases={() => setPlan("Restore unavailable in this development web preview; no billing request made.")}
    statusMessage={statusMessage} restoreAnnotation="(dev unavailable)" accessibilityLabel="Subscription artwork development preview" purchaseAnnotation=" — display-only prototype"/>;
}
