import type { StoreReviewPlugin } from "./StoreReview";

export const StoreReviewWeb: StoreReviewPlugin = {
  async requestReview() {
    return { presented: false };
  },
};
