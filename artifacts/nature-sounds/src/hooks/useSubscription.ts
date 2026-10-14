import { useCallback, useEffect, useRef, useState } from "react";
import { observeFreeviewSubscription } from "../lib/developmentFreeview";
import {
  EarphoriaBilling,
  isPlayBillingAvailable,
  isStoreKitAvailable,
  isNativeBillingAvailable,
} from "../plugins/EarphoriaBilling";

export type SubscriptionAccessStatus = "loading" | "active" | "inactive" | "unknown" | "pending";

export function useSubscription() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [catalogAvailable, setCatalogAvailable] = useState(false);
  const [accessStatus, setAccessStatus] = useState<SubscriptionAccessStatus>(() =>
    isNativeBillingAvailable ? "loading" : "inactive"
  );
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [debugUnlockAvailable, setDebugUnlockAvailable] = useState(false);
  const activeInMemoryRef = useRef(false);

  const applySubscriptionStatus = useCallback((subscribed: boolean) => {
    observeFreeviewSubscription(subscribed);
    activeInMemoryRef.current = subscribed;
    setIsSubscribed(subscribed);
    if (subscribed) {
      setAccessStatus("active");
      setStatusLabel("active");
    } else {
      setAccessStatus("inactive");
      setStatusLabel("inactive");
    }
  }, []);

  const applyUnknownStatus = useCallback(() => {
    observeFreeviewSubscription(activeInMemoryRef.current);
    if (activeInMemoryRef.current) {
      setIsSubscribed(true);
      setAccessStatus("active");
      setStatusLabel("active");
      return;
    }
    setIsSubscribed(false);
    setAccessStatus("unknown");
    setStatusLabel(null);
  }, []);

  useEffect(() => {
    if (!isNativeBillingAvailable) return;
    let cancelled = false;
    let remove: (() => void) | undefined;

    (async () => {
      try {
        const init = await EarphoriaBilling.initialize();
        if (!cancelled) {
          setDebugUnlockAvailable(!!init.debugUnlockAvailable);
          setCatalogAvailable(!!init.productAvailable);
        }
        try {
          const status = await EarphoriaBilling.getSubscriptionStatus();
          if (!cancelled) {
            applySubscriptionStatus(!!status.isSubscribed);
          }
        } catch {
          if (!cancelled) applyUnknownStatus();
        }
        const handle = await EarphoriaBilling.addListener("subscriptionStatus", (data) => {
          const sub = Boolean(data.isSubscribed);
          applySubscriptionStatus(sub);
          if ("productAvailable" in data) {
            setCatalogAvailable(Boolean(data.productAvailable));
          }
        });
        remove = () => { handle.remove(); };
      } catch {
        if (!cancelled) applyUnknownStatus();
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [applySubscriptionStatus, applyUnknownStatus]);

  const subscribe = useCallback(async () => {
    if (!isNativeBillingAvailable || busy) return;
    setBusy(true);
    try {
      if (isStoreKitAvailable) {
        if (!catalogAvailable) {
          alert("Purchasing is temporarily unavailable while the App Store catalog loads. Please try again in a moment.");
          return;
        }
        const result = await EarphoriaBilling.presentPaywall();
        if (!result.presented && !result.isSubscribed && result.productAvailable === false) {
          setCatalogAvailable(false);
          alert("Purchasing is temporarily unavailable while the App Store catalog loads. Please try again in a moment.");
          return;
        }
        applySubscriptionStatus(!!result.isSubscribed);
        return;
      }
      // Android keeps a native cached subscription flag for startup UX, but Play
      // remains the source of truth when status can be queried. Server-side
      // receipt verification is still the stronger production model.
      const details = await EarphoriaBilling.getProductDetails();
      if (!details.available) {
        setCatalogAvailable(false);
        alert("Purchasing is temporarily unavailable because Google Play did not return the subscription product. Please try again later.");
        return;
      }
      setCatalogAvailable(true);
      const result = await EarphoriaBilling.purchase();
      if (result.pending) {
        setAccessStatus("pending");
        setStatusLabel("pending");
        alert("Payment is pending. Access unlocks when Google Play confirms the purchase.");
      } else {
        applySubscriptionStatus(true);
        alert("Subscription activated. Thank you!");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) {
        const unavailable = /product details unavailable|missing productdetails|offerToken|item_unavailable|no product/i.test(msg);
        alert(unavailable
          ? "Purchasing is temporarily unavailable because the subscription product could not be loaded. Please try again later."
          : msg || "Purchase failed");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, catalogAvailable, applySubscriptionStatus]);

  const restore = useCallback(async () => {
    if (!isNativeBillingAvailable) {
      alert("Sign in to the App Store with the same Apple ID used when you subscribed, then restore purchases from Settings.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const status = await EarphoriaBilling.restore();
      applySubscriptionStatus(!!status.isSubscribed);
      alert(status.isSubscribed
        ? "Subscription restored."
        : isStoreKitAvailable
          ? "No active App Store subscription found for this Apple ID."
          : "No active Google Play subscription found for this account.");
    } catch (e: unknown) {
      applyUnknownStatus();
      alert(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }, [busy, applySubscriptionStatus, applyUnknownStatus]);

  const debugSetSubscribed = useCallback(async (subscribed: boolean) => {
    if (!debugUnlockAvailable || busy) return;
    setBusy(true);
    try {
      const status = await EarphoriaBilling.debugSetSubscribed({ subscribed });
      applySubscriptionStatus(!!status.isSubscribed);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Debug unlock failed");
    } finally {
      setBusy(false);
    }
  }, [busy, debugUnlockAvailable, applySubscriptionStatus]);

  return {
    isSubscribed,
    catalogAvailable,
    accessStatus,
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
