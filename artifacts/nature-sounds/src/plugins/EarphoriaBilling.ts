import { Capacitor, registerPlugin } from "@capacitor/core";

/** Monthly subscription product configured in Google Play Console. */
export const BILLING_PRODUCT_ID = "earphoria499";
export const BILLING_BASE_PLAN_ID = "monthly-plan";

export interface ProductDetailsResult {
  available: boolean;
  productId?: string;
  title?: string;
  description?: string;
  formattedPrice?: string | null;
  billingPeriod?: string | null;
  basePlanId?: string;
  offerToken?: string;
}

export interface PurchaseResult {
  productIds?: string[];
  purchaseToken?: string;
  orderId?: string | null;
  isAcknowledged?: boolean;
  purchaseState?: number;
  isSubscribed?: boolean;
  pending?: boolean;
}

export interface SubscriptionStatus {
  isSubscribed: boolean;
  productId?: string;
  basePlanId?: string;
  purchases?: PurchaseResult[];
}

export interface InitializeResult {
  productId: string;
  basePlanId: string;
  isSubscribed: boolean;
}

export interface EarphoriaBillingPlugin {
  initialize(): Promise<InitializeResult>;
  getProductDetails(): Promise<ProductDetailsResult>;
  purchase(): Promise<PurchaseResult>;
  restore(): Promise<SubscriptionStatus>;
  getSubscriptionStatus(): Promise<SubscriptionStatus>;
  addListener(
    eventName:
      | "billingReady"
      | "productDetails"
      | "purchaseSuccess"
      | "purchaseCanceled"
      | "purchasePending"
      | "subscriptionStatus"
      | "billingError",
    listenerFunc: (data: Record<string, unknown>) => void,
  ): Promise<{ remove: () => void }>;
  removeAllListeners(): Promise<void>;
}

const EarphoriaBilling = registerPlugin<EarphoriaBillingPlugin>("EarphoriaBilling", {
  web: () =>
    import("./EarphoriaBillingWeb").then((m) => m.EarphoriaBillingWeb),
});

export { EarphoriaBilling };

/** True when running inside Capacitor on Android (Play Billing). */
export const isPlayBillingAvailable =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
