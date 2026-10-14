# Freeview Stage 2 — development expiration

Enforcement is **OFF by default**. No banner, paywall, exhausted-track artwork, billing redesign, or mobile app build is included.

## Switch

Before playback, in the app's developer console:

```js
await window.EarphoriaDevelopmentFreeview.setEnabled(true)
await window.EarphoriaDevelopmentFreeview.getStatus()
// Disable; this restores only the independent Freeview envelope:
await window.EarphoriaDevelopmentFreeview.setEnabled(false)
```

Web accepts enablement only under Vite's `import.meta.env.DEV`. It rejects enabling during already-active playback so no live audio graph has to be rewired. Native iOS requires `DEBUG`; Android requires the application's `FLAG_DEBUGGABLE`. Release/native and production-web requests remain disabled. Native mode lasts for the app process; web starts disabled on page reload. Counters/exhaustion retain their existing process/tab session history. Use a new app process/tab session for fresh allowances; disabling/re-enabling is not an allowance reset.

Existing subscription displays/lock graphics remain unchanged. Test mode bypasses only the soundscape click/play gate, so all 37 soundscapes can be tested; RingMatch remains gated. Failed exhausted-track requests silently clear speculative PLAY state, without a popup.

## Enforcement and precedence

At 60 cumulative intended-playback seconds, each canonical soundscape latches as exhausted. Subscribers bypass both rejection and expiration, using the existing subscription state. Native starts/recovery and Android asynchronous decode completion are checked; web checks both before loading and before playback. Identity-specific cleanup never calls global stop or stops a diagnostic tone.

If an existing pause, outgoing crossfade, sleep fade, interruption, STOP, RingMatch action or replacement is already stopping the instance, Freeview records exhaustion and yields. It never extends that action. If such an action begins during Freeview's envelope, only the Freeview schedule is cancelled/frozen; the original action keeps its original timing and curve.

- **Web:** one dedicated GainNode per playback instance. A linear envelope on its own AudioParam ends exactly 1.000 audio-clock seconds after the predicted cumulative 60-second boundary. Its captured sources receive matching `source.stop` deadlines. Those deadlines also work when JS cleanup timers are throttled. Existing actions cancel only this plan, restoring original natural source deadlines before the original action stops its sources. Accounting has an independent preview deadline so delayed cleanup cannot count the subsequent silence; plans are corrected when a late loop scheduler leaves a known gap. Known interruption recovery releases an already-exhausted instance without restarting it.
- **iOS:** `freeviewLevel` multiplies the original already-clamped output level. A separate 10ms main/common-mode timer evaluates a linear uptime envelope of 1.000 seconds. Its dedicated completion releases only its own nodes/engine, without calling legacy pause/stop/fade cancellation. A separate 20ms development policy observes cumulative usage. Completion and recovery recheck existing subscription state.
- **Android:** `freeviewLevel` is a separate final scalar after the original DSP, limiter and clipping. Its linear monotonic envelope is 1.000 seconds; a dedicated per-player Handler completion releases only that PCMPlayer. The service polls policy every 20ms while enabled and preserves outgoing tails. It checks the player's observed ID, not a pending incoming track's metadata. Completion rechecks authorization and service cleanup uses identity/pending-load guards. Existing fade fields are never reset by Freeview.

Native policy/state remains process-owned across UI/activity/service recreation. Web accounting unions internal and rapid same-track replay overlaps; different tracks retain separate totals. The passive accounting still measures intended playback, not hardware output.

## Validation

Passed:

- `node artifacts/nature-sounds/tests/development-freeview.mjs`: all 37 IDs including High Tide Beach; off/production gates; normal expiry; pause and same-track replay; outgoing/ incoming overlaps; loop union; stale instance protection; background-throttled cleanup; interruptions/recovery; subscriber/disable bypass; sleep precedence.
- `python3 artifacts/nature-sounds/tests/development-freeview-native.py`: Swift DEBUG/non-DEBUG policies, process counters and interruption/bypass simulation; real PCMPlayer control/completion paths with fake scheduling, including pause/switch/STOP precedence, stale replacements, subscribers, sleep priority and unchanged legacy gain fields.
- Stage 1 native and web deterministic suites.
- TypeScript `tsc --noEmit`; Swift policy/player type checking and bridge syntax parsing; Android player/decoder/policy compilation against the installed SDK. Service/bridge static compilation also passed with installed Android/core APIs, real Capacitor JSON classes, and temporary activity/control-interface stubs; Android annotation/deprecation warnings were emitted. This is not a complete mobile application build.
- `git diff --check`.
- `python3 artifacts/nature-sounds/tests/verify-freeview-audio-baseline.py`: exact loop/DSP source, Safari offsets, existing fade constants, RingMatch/sleep triggers and unchanged audio-session/service/build configuration compared with the local Stage 1 checkpoint.

### Physical-device validation still required

Compare recordings to the audio baseline with mode OFF and ON. Exercise locked-screen and background expiry on iPhone/iPad and Android/OEM devices, internal loop boundaries and track switches near 60s, rapid pause/replay/replacement, incoming decode starvation/cancellation, notification controls, Bluetooth/output changes, interruptions before/during expiration, sleep/RingMatch precedence, activity/service recreation, and verified subscription changes just before completion.

The 1.000-second envelope is exact as configured; audible timing retains practical buffering/dispatch error (potentially a few hundred milliseconds). Native tick/dispatch delay, Android queued PCM flushing, Safari interruption/stop-event ordering and asynchronous entitlement delivery require device measurements. iOS bridge/full-app compilation was not run. No release app artifacts were created.

## Stage 2 files

Paths relative to `artifacts/nature-sounds/`:

- `src/App.tsx`
- `src/hooks/useNativeAudioEngine.ts`
- `src/hooks/useSubscription.ts`
- `src/hooks/useWebAudioEngine.ts`
- `src/lib/developmentFreeview.ts` (new)
- `src/lib/freeviewInstance.ts` (new)
- `src/lib/playbackUsage.ts`
- `src/plugins/EarvanaAudio.ts`
- `src/plugins/EarvanaAudioWeb.ts`
- `ios/App/CapApp-SPM/Sources/CapApp-SPM/DevelopmentFreeview.swift` (new)
- `ios/App/CapApp-SPM/Sources/CapApp-SPM/CrossfadeLoopPlayer.swift`
- `ios/App/CapApp-SPM/Sources/CapApp-SPM/EarvanaAudioPlugin.swift`
- `android/app/src/main/java/com/earvana/tinnitusrelief/DevelopmentFreeview.java` (new)
- `android/app/src/main/java/com/earvana/tinnitusrelief/PCMPlayer.java`
- `android/app/src/main/java/com/earvana/tinnitusrelief/EarvanaAudioService.java`
- `android/app/src/main/java/com/earvana/tinnitusrelief/EarvanaAudioPlugin.java`
- `tests/development-freeview.mjs` (new)
- `tests/development-freeview-native.py` (new)
- `tests/verify-freeview-audio-baseline.py` (new)
- `docs/FREEVIEW-STAGE2-DEVELOPMENT.md` (this file)

Pre-existing working edits were retained. Native billing managers/bridges, the billing TS interface and shared legacy freemium rules were not changed by Stage 2. A local pre-Stage-2 working-file checkpoint is `/private/tmp/Earphoria_STAGE1_BEFORE_STAGE2_20261005.tar`; the earlier durable audio-baseline backup is untouched. No commits, pushes or deployments.
