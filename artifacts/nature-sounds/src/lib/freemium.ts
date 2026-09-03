import { Capacitor } from "@capacitor/core";
import { FREE_TRACK_ID } from "../sounds";

export { FREE_TRACK_ID };

/** Freemium track locking is iOS-only (StoreKit 2 / Guideline 2.1 + 3.1.2). */
export const isFreemiumLockingEnabled =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

export function isPremiumTrack(trackId: string): boolean {
  return trackId !== FREE_TRACK_ID;
}

export function isTrackLocked(
  trackId: string,
  isSubscribed: boolean,
  catalogAvailable = false,
): boolean {
  return (
    isFreemiumLockingEnabled &&
    catalogAvailable &&
    !isSubscribed &&
    isPremiumTrack(trackId)
  );
}
