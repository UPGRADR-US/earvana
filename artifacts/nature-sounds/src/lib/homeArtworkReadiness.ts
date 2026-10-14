/** Initial visible-home assets only. No audio or application state is owned here. */
export const HOME_STARTUP_ARTWORK = [
  'earphoria-redesign/published-home-bg.png',
  'earphoria-redesign/TopBannerBase25.png',
  'earphoria-redesign/TopBannerLogo25.png',
] as const;
const pending = new Map<string, Promise<void>>();
// Retain decoded images for the transition from readiness to the visible CSS/image consumers.
const images = new Map<string, HTMLImageElement>();
function loadArtwork(url: string): Promise<void> {
  const cached = pending.get(url);
  if (cached) return cached;
  const image = new Image();
  images.set(url, image);
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = image.onerror = null;
      if (error) reject(error); else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error('Artwork loading timed out')), 15000);
    const loaded = async () => {
      if (settled) return;
      try {
        if (!image.naturalWidth) throw new Error('Artwork unavailable');
        if (typeof image.decode === 'function') await image.decode();
        finish();
      } catch { finish(new Error('Artwork could not be decoded')); }
    };
    image.onload = () => { void loaded(); };
    image.onerror = () => finish(new Error('Artwork could not be loaded'));
    image.fetchPriority = 'high';
    image.src = url;
    if (image.complete) void loaded();
  });
  pending.set(url, promise);
  void promise.catch(() => { pending.delete(url); images.delete(url); });
  return promise;
}
export async function prepareHomeArtwork() {
  await Promise.all(HOME_STARTUP_ARTWORK.map(path => loadArtwork(`${import.meta.env.BASE_URL}${path}`)));
}
