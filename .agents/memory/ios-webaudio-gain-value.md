---
name: iOS Safari AudioParam .value bug + play-while-playing re-entrancy
description: Reading AudioParam.value after setValueCurveAtTime returns wrong value on iOS; plus play()-while-playing re-entrancy causes pop+slow-fade-out+unstoppable audio.
---

## Bug 1 — reading .gain.value after setValueCurveAtTime

Never read `AudioParam.gain.value` after a `setValueCurveAtTime` to use as a starting point for a subsequent automation. On iOS Safari, `.value` returns the last *explicit* `setValueAtTime` value, not the curve's final interpolated value.

**Why:** iOS Safari (WebKit) does not update `.value` to reflect the live computed value when scheduled automations are in progress or have just completed.

**How to apply:**
1. For crossfade outgoing slot: always hardcode `setValueAtTime(1, crossStart)` and call `cancelScheduledValues(crossStart)` first — the slot is known to be at full volume.
2. For volume reporting: use the stored `this.volume` property, not `trackGain.gain.value`.

---

## Bug 2 — bgEl.paused unreliable while iOS play() promise is pending

After calling `el.play()` on an `<audio>` element, iOS Safari may still report `el.paused === true` until the promise resolves. Any `if (!el.paused) el.pause()` guard silently skips an element about to start playing.

**How to apply:** Always call `el.pause()` unconditionally — remove all `!el.paused` guards in pause-all and cleanup paths.

---

## Bug 3 — play()-while-playing re-entrancy: pop + slow fade down + unstoppable audio

**Symptom:** Track pops on (no fade-in), then slowly fades down ~15 s, pause button has no effect, force-quit required. Erratic — most common on app foreground/unlock.

**Root cause:** iOS MediaSession fires a `play` action when the app is foregrounded while already playing. This calls `play(trackId)` while `engine.isPlaying === true`. The aggressive-pause-all skips the current track. Then `setVolume()` runs while `isPlaying === true`, calling `cancelScheduledValues` which **kills the fade-in curve** and snaps gain to target instantly (pop). Then `engine.play()` hits `if (this.isPlaying) return` → no new source node created → original crossfade schedule runs to completion → 15-second fade-out → "slow fade down" → state muddled → can't stop.

**Fix:** In `play()`, after engine creation but before `setVolume()`:
```ts
if (enginesRef.current[trackId].isPlaying) {
  lastPlayedIdRef.current = trackId;
  return; // initContext() above already resumed the AudioContext
}
```

**Why:** `initContext()` at the top of `play()` already called `ctx.resume()`, so a suspended context is unblocked. The early return prevents `setVolume` from touching live gain automations.
