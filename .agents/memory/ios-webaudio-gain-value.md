---
name: iOS Safari WebAudio gain bugs
description: Known iOS Safari AudioParam pitfalls: gain.value unreliable after curves; setValueCurveAtTime skipped when same timestamp as setValueAtTime; play-while-playing re-entrancy.
---

## Bug 1 — reading .gain.value after setValueCurveAtTime

On iOS Safari, `GainNode.gain.value` reads back as the last *explicit* `setValueAtTime` value, not the live interpolated curve value.

**How to apply:**
1. For crossfade outgoing slot: always hardcode `setValueAtTime(1, crossStart)` and call `cancelScheduledValues(crossStart)` first.
2. For volume reporting: use stored `this.volume`, not `trackGain.gain.value`.

---

## Bug 2 — setValueCurveAtTime skipped when scheduled at the same timestamp as setValueAtTime (CRITICAL)

**Rule:** Never schedule `setValueAtTime(X, t)` and `setValueCurveAtTime(curve, t, dur)` at the exact same time `t`. iOS Safari's tie-breaking is undefined. On the **first use** of a newly created GainNode the curve is frequently skipped, leaving the gain frozen at the `setValueAtTime` value.

**Symptoms:**
- Fade-in: track pops on at target volume instead of fading up (setValueAtTime(0,t) wins → gain = 0, then curve skipped → gain never ramps).
- Crossfade: inGain freezes at 0 (silent new loop), outGain freezes at 1 (no fade-out, abrupt cut when source expires by duration). Glitch happens only on the first crossfade per track session — after that, iOS handles it correctly because the nodes have an event history.

**Why "only once":** After the first curve event fires (even if skipped), the node's internal state changes such that iOS processes subsequent `setValueCurveAtTime` calls correctly. Fresh GainNodes (no event history) are the vulnerable case.

**Fix:** Add a 10 ms offset between the `setValueAtTime` anchor and the `setValueCurveAtTime` curve start:
```ts
// WRONG — same timestamp, iOS may skip the curve
gain.gain.setValueAtTime(0, crossStart);
gain.gain.setValueCurveAtTime(EQUAL_POWER_IN, crossStart, xfade);

// CORRECT — 10 ms gap eliminates ambiguity, inaudible
const curveStart = crossStart + 0.01;
gain.gain.setValueAtTime(0, crossStart);
gain.gain.setValueCurveAtTime(EQUAL_POWER_IN, curveStart, xfade);
```

For the initial fade-in (fade from silence, no crossfade overlap needed), use `linearRampToValueAtTime` instead — even simpler and equally reliable:
```ts
gain.gain.setValueAtTime(0, startTime);
gain.gain.linearRampToValueAtTime(volume, startTime + FADE_IN_DURATION);
```

**How to apply:** Every call to `setValueCurveAtTime` must use a `curveStart` that is at least 0.01s after the preceding `setValueAtTime`.

---

## Bug 3 — bgEl.paused unreliable while iOS play() promise is pending

After calling `el.play()`, iOS may still report `el.paused === true` until the promise resolves.

**Fix:** Always call `el.pause()` unconditionally — no `!el.paused` guards in any pause-all or cleanup path.

---

## Bug 4 — play()-while-playing re-entrancy: pop + slow fade down + unstoppable audio

**Symptom:** Track pops on, slowly fades over ~15 s, pause button ineffective, force-quit required. Most common on iOS app foreground (MediaSession 'play' action fires while track is already live).

**Root cause:** `play(trackId)` called while `engine.isPlaying === true`. Aggressive-pause skips current track. `setVolume()` runs while isPlaying=true → `cancelScheduledValues` kills fade-in curve → gain snaps to target (pop). `engine.play()` hits `if (this.isPlaying) return` → no new source → orphaned crossfade schedule runs to completion → 15 s fade-out → state muddled → can't stop.

**Fix:** In `play()`, after engine creation but before `setVolume()`:
```ts
if (enginesRef.current[trackId].isPlaying) {
  lastPlayedIdRef.current = trackId;
  return; // initContext() above already resumed the AudioContext
}
```

---

## Bug 5 — loud burst + iOS compression on context resume from background

**Symptom:** Max volume + "compressed" (iOS limiter activating) when foregrounding the app.

**Cause:** `bgEl` audio pipeline hasn't drained when `ctx.resume()` fires; OR iOS resets GainNode automations during suspension. Both sources play simultaneously at full gain → signal sums above 1.0 → iOS hardware limiter.

**Fix:** Zero the master gain node before resuming, restore to target volume 100 ms after resume. Leaves per-track gain schedules untouched:
```ts
mg.gain.setValueAtTime(0, ctx.currentTime);
ctx.resume().then(() => {
  const now = ctx.currentTime;
  mg.gain.setValueAtTime(0, now);
  mg.gain.linearRampToValueAtTime(vol, now + 0.1);
});
```
