import { Capacitor } from '@capacitor/core';

const isLocalWebTest = import.meta.env.DEV && !Capacitor.isNativePlatform() &&
  new URLSearchParams(window.location.search).get('freeviewTest') === '1';
// Explicit developer UI action only. Clear once on the next navigation, BEFORE
// App/Stage 1's process-owned observer is imported. Normal reload/BFCache is unchanged.
if (isLocalWebTest && new URLSearchParams(window.location.search).get('freeviewReset') === '1') {
  sessionStorage.removeItem('earphoria.playbackUsage.v1');
  const url = new URL(window.location.href);
  url.searchParams.delete('freeviewReset');
  window.history.replaceState(window.history.state, '', url);
}
export function startFreshFreeviewTest() {
  if (!isLocalWebTest) return;
  const url = new URL(window.location.href);
  url.searchParams.set('freeviewReset', '1');
  window.location.assign(url.href);
}
