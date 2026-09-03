// Web fallback — Play Billing is Android-only.
import type {
  EarphoriaBillingPlugin,
  InitializeResult,
  PaywallResult,
  ProductDetailsResult,
  PurchaseResult,
  SubscriptionStatus,
} from "./EarphoriaBilling";
import {
  BILLING_BASE_PLAN_ID,
  BILLING_PRODUCT_ID,
} from "./EarphoriaBilling";

const unavailable = (action: string) =>
  Promise.reject(new Error(`Play Billing is not available on web (${action})`));

export const EarphoriaBillingWeb: EarphoriaBillingPlugin = {
  async initialize(): Promise<InitializeResult> {
    return {
      productId: BILLING_PRODUCT_ID,
      basePlanId: BILLING_BASE_PLAN_ID,
      isSubscribed: false,
    };
  },
  async getProductDetails(): Promise<ProductDetailsResult> {
    return { available: false };
  },
  async purchase(): Promise<PurchaseResult> {
    return unavailable("purchase");
  },
  async presentPaywall(): Promise<PaywallResult> {
    return { presented: false, isSubscribed: false };
  },
  async restore(): Promise<SubscriptionStatus> {
    return { isSubscribed: false, productId: BILLING_PRODUCT_ID, basePlanId: BILLING_BASE_PLAN_ID, purchases: [] };
  },
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return { isSubscribed: false, productId: BILLING_PRODUCT_ID, basePlanId: BILLING_BASE_PLAN_ID, purchases: [] };
  },
  async debugSetSubscribed(options: { subscribed: boolean }): Promise<SubscriptionStatus> {
    return { isSubscribed: options.subscribed, productId: BILLING_PRODUCT_ID, basePlanId: BILLING_BASE_PLAN_ID, purchases: [] };
  },
  async addListener() {
    return { remove: () => {} };
  },
  async removeAllListeners() {},
};
