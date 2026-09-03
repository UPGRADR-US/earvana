import { Capacitor, registerPlugin } from "@capacitor/core";

export interface StoreReviewPlugin {
  requestReview(): Promise<{ presented: boolean }>;
}

const StoreReview = registerPlugin<StoreReviewPlugin>("StoreReview", {
  web: () => import("./StoreReviewWeb").then((m) => m.StoreReviewWeb),
});

export { StoreReview };

/** True on iOS / Android Capacitor builds (StoreKit / Play In-App Review). */
export const isStoreReviewAvailable = Capacitor.isNativePlatform();
