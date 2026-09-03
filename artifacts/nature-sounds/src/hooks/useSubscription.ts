import { useCallback, useEffect, useState } from "react";
import {
  EarphoriaBilling,
  isPlayBillingAvailable,
  isStoreKitAvailable,
  isNativeBillingAvailable,
} from "../plugins/EarphoriaBilling";

export function useSubscription() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [catalogAvailable, setCatalogAvailable] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [debugUnlockAvailable, setDebugUnlockAvailable] = useState(false);

  useEffect(() => {
    if (!isNativeBillingAvailable) return;
    let cancelled = false;
    let remove: (() => void) | undefined;

    (async () => {
      try {
        const init = await EarphoriaBilling.initialize();
        const status = await EarphoriaBilling.getSubscriptionStatus();
        if (!cancelled) {
          setDebugUnlockAvailable(!!init.debugUnlockAvailable);
          setCatalogAvailable(!!init.productAvailable);
          setIsSubscribed(!!status.isSubscribed);
          setStatusLabel(status.isSubscribed ? "active" : "inactive");
        }
        const handle = await EarphoriaBilling.addListener("subscriptionStatus", (data) => {
          const sub = Boolean(data.isSubscribed);
          setIsSubscribed(sub);
          if ("productAvailable" in data) {
            setCatalogAvailable(Boolean(data.productAvailable));
          }
          setStatusLabel(sub ? "active" : "inactive");
        });
        remove = () => { handle.remove(); };
      } catch {
        /* billing optional at UI layer */
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!isNativeBillingAvailable || busy) return;
    setBusy(true);
    try {
      if (isStoreKitAvailable) {
        if (!catalogAvailable) {
          alert("Apple is still activating in-app purchases. All sounds are unlocked until the store catalog is live.");
          return;
        }
        const result = await EarphoriaBilling.presentPaywall();
        setIsSubscribed(!!result.isSubscribed);
        setStatusLabel(result.isSubscribed ? "active" : "inactive");
        return;
      }
      await EarphoriaBilling.getProductDetails();
      const result = await EarphoriaBilling.purchase();
      if (result.pending) {
        setStatusLabel("pending");
        alert("Payment is pending. Access unlocks when Google Play confirms the purchase.");
      } else {
        setIsSubscribed(true);
        setStatusLabel("active");
        alert("Subscription activated. Thank you!");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) alert(msg || "Purchase failed");
    } finally {
      setBusy(false);
    }
  }, [busy, catalogAvailable]);

  const restore = useCallback(async () => {
    if (!isNativeBillingAvailable) {
      alert("Sign in to the App Store with the same Apple ID used when you subscribed, then restore purchases from Settings.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const status = await EarphoriaBilling.restore();
      setIsSubscribed(!!status.isSubscribed);
      setStatusLabel(status.isSubscribed ? "active" : "inactive");
      alert(status.isSubscribed
        ? "Subscription restored."
        : isStoreKitAvailable
          ? "No active App Store subscription found for this Apple ID."
          : "No active Google Play subscription found for this account.");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const debugSetSubscribed = useCallback(async (subscribed: boolean) => {
    if (!debugUnlockAvailable || busy) return;
    setBusy(true);
    try {
      const status = await EarphoriaBilling.debugSetSubscribed({ subscribed });
      setIsSubscribed(!!status.isSubscribed);
      setStatusLabel(status.isSubscribed ? "active" : "inactive");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Debug unlock failed");
    } finally {
      setBusy(false);
    }
  }, [busy, debugUnlockAvailable]);

  return {
    isSubscribed,
    catalogAvailable,
    statusLabel,
    busy,
    subscribe,
    restore,
    debugUnlockAvailable,
    debugSetSubscribed,
    billingAvailable: isNativeBillingAvailable,
    isPlayBilling: isPlayBillingAvailable,
    isStoreKit: isStoreKitAvailable,
  };
}
