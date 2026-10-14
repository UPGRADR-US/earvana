import { Capacitor } from '@capacitor/core';
import { startSharedBlinkClock } from './sharedBlinkClock';
export { blinkValues } from './sharedBlinkClock';
// Keep the existing local-preview start time/phase unchanged.
if (import.meta.env.DEV && !Capacitor.isNativePlatform() &&
    new URLSearchParams(window.location.search).get('freeviewTest') === '1') {
  startSharedBlinkClock();
}
