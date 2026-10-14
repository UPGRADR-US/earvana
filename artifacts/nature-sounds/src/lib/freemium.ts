import { Capacitor } from "@capacitor/core";
import { FREE_TRACK_ID } from "../sounds";

export { FREE_TRACK_ID };

/** Freemium track locking is native-only. Web remains fully open for previews. */
export const isFreemiumLockingEnabled =
  Capacitor.isNativePlatform() &&
  (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");

export function isPremiumTrack(trackId: string): boolean {
  return trackId !== FREE_TRACK_ID;
}

export function hasPremiumAccess(isSubscribed: boolean): boolean {
  return !isFreemiumLockingEnabled || isSubscribed;
}

export function isPremiumFeatureLocked(isSubscribed: boolean): boolean {
  return !hasPremiumAccess(isSubscribed);
}

export function isTrackLocked(trackId: string, isSubscribed: boolean): boolean {
  return (
    isFreemiumLockingEnabled &&
    !isSubscribed &&
    isPremiumTrack(trackId)
  );
}
