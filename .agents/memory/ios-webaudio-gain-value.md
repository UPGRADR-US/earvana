---
name: iOS Safari AudioParam .value bug
description: Reading AudioParam.value after setValueCurveAtTime returns the wrong value on iOS Safari — affects crossfades and background volume.
---

## Rule
Never read `AudioParam.gain.value` after a `setValueCurveAtTime` to use as a starting point for a subsequent automation. On iOS Safari, `.value` returns the last *explicit* `setValueAtTime` value, not the curve's final interpolated value.

## Why
iOS Safari (WebKit) does not update `.value` to reflect the live computed value when scheduled automations are in progress or have just completed. It returns the nominal value from the last direct assignment. This causes:
- Crossfade fade-outs starting from 0 instead of 1 → loud jump or silent cut
- `currentGain` getter returning 0 mid-fade-in → wrong background audio volume

## How to apply
1. For crossfade outgoing slot: always hardcode `setValueAtTime(1, crossStart)` and call `cancelScheduledValues(crossStart)` first — the slot is known to be at full volume.
2. For volume reporting: use the stored `this.volume` property, not `trackGain.gain.value`.
