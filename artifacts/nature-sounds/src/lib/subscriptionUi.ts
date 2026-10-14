/** Display data must come from verified native store offers in production. */
export interface SubscriptionOfferDisplay {
  readonly monthlyPrice: string;
  readonly annualPrice: string;
  readonly trialDuration: string | null;
  readonly cardTrialLabel: string | null;
  readonly savingsLabel: string | null;
  readonly disclosure: readonly string[];
}
export interface SubscriptionUiCallbacks {
  /** Adapter handles pending/error state and entitlement verification; no UI success simulation. */
  readonly onMonthlyPurchase: () => void;
  readonly onAnnualPurchase: () => void;
  readonly onRestorePurchases: () => void;
  readonly onDismiss: () => void;
}
