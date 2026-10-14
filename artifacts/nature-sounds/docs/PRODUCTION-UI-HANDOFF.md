# Production UI preparation — native integration remains disabled

This change separates presentation from local test adapters. It does not enable production Freeview, connect store purchases, change entitlement policy, or change audio/accounting. Existing App.tsx release gates and native debug-only enforcement controls remain intact.

## Approved Freeview presentation

`FreeviewBar.tsx` owns only the existing v5 artwork, typography, CTA callback and visual animation. `FreeviewTestBar.tsx` remains the development-web adapter using the existing observer; it alone supplies the Start fresh test control. Neither the pure bar nor its status contract imports counters, native audio or billing.

`sharedBlinkClock.ts` contains the unchanged singleton visual envelope. The development adapter starts it at its existing startup point; the pure bar also requests the same singleton on mount. It never creates a second phase or changes playback. CSS class/property names intentionally retain their existing names.

## Required authoritative Freeview status

Implement a native adapter for the readonly `FreeviewStatus` contract in `src/lib/freeviewStatus.ts`:

- `sessionId`: stable for the app process; never reset on WebView/Activity remount, lock, background or service recreation. Change only for a genuine new session.
- `enabled`: authoritative policy initialization status. Production is not wired by this change.
- `subscriberStatus`: loading / active / inactive / unknown, supplied by verified entitlement. The presentation projection hides Freeview for loading, unknown and active states; this is a UI rule, not a new playback authorization policy.
- `activeTrackId`, `selectedTrackId`, `playbackState`: native-authoritative playing/paused/loading/stopped/interrupted state, with the current canonical catalog IDs.
- `tracks`: per-track native remaining seconds, sampled flag, exhausted latch and expiration phase. Include outgoing audible crossfade tails; internal looping remains one soundscape. Do not calculate elapsed playback in React. Populate countdowns with `formatRemainingAllowance` and use the existing track-row presentation props.
- `lifecycle`: stable, retained event IDs with track and playback-instance identity for expiration-started, expiration-midpoint and expiration-stopped. Signal midpoint from the existing expiration envelope, not a UI timeout. Existing user/system stop precedence still applies; do not synthesize a midpoint for an envelope that did not occur. Retain event IDs in status snapshots so UI remounts do not replay animations.

`freeviewBarState(status)` creates only display state and session-qualified emphasis event IDs. Render `FreeviewBar` only when it returns non-null. Pass actual native playing state as `isPlaying`. Preserve existing blocked-exhausted-track controls in the host; the bar cannot enforce playback limits.

No native status adapter or release policy bootstrap is installed here. Justin must connect snapshots/listeners and preserve generation protection, entitlement bypass, interruption handling, background services and the independent 1-second fade.

## Approved subscription presentation

`SubscriptionPopup.tsx` has no billing, entitlement or mock purchase dependency. It accepts:

- `offer: SubscriptionOfferDisplay | null`: localized monthly/annual price labels, eligible trial duration, card trial label, verified savings and disclosure lines. Missing offers show unavailable/disabled cards. A null trial suppresses free-trial claims.
- `onMonthlyPurchase`, `onAnnualPurchase`, `onRestorePurchases`, `onDismiss`: required callbacks (`SubscriptionUiCallbacks`). These callbacks do not imply success. The caller handles async native requests, pending/cancelled/error states and verified entitlement updates.
- `busy`, `statusMessage`: caller-owned feedback; purchase/restore controls disable while busy.
- Existing legal content and soundscape/RingMatch variant.

`SubscriptionPreview.tsx` alone owns provisional $4.99/$39.99 prices, seven-day trial, 33% savings and display-only tap feedback. It returns null in production and on native devices. Existing App.tsx production routing still uses the original subscription invitation/policy.

Justin must configure and verify the two store products/offers, trial eligibility, accurate localized disclosures, restore behavior and subscriber-state refresh before mounting the new popup in production. Do not reuse the preview adapter or turn DEV on in release builds. Purchase success must resume pending RingMatch selection through the existing recommendation/notching confirmations; it must not directly apply a notch or grant entitlement from a card tap.

## Developer controls and remaining release work

The console Freeview controller is now DEV-only. Query switches and session reset remain DEV/web-only. Native DEBUG entitlement overrides and all existing production subscription gates are unchanged.

Still required: release native enforcement bootstrap; read-only native lifecycle/status bridge; legacy High Tide Beach exception resolution; entitlement-loss behavior; verified billing adapter; version alignment; native build/sync and physical-device regression tests.

Validate native session persistence, outgoing tails, loop overlap, interruptions, rapid replacement, notification controls, subscription activation/revocation, RingMatch Status/Repeat Test/warnings, reduced motion and image-readiness failures. The production web build for this preparation is a test artifact only and must not replace the public meeting preview.
