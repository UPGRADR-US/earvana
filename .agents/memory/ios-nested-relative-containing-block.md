---
name: iOS WebKit nested relative containing block bug
description: When absolute inset-0 is inside a relative parent that is itself inside another relative ancestor, iOS Safari/Capacitor can resolve the containing block against the outer relative element instead of the direct parent
---

## Rule
Avoid nested `position: relative` elements when one of them contains `absolute inset-0` (or `absolute` + explicit `top/left/right/bottom`) children. iOS WebKit / Capacitor (WKWebView) may pick the outermost `relative` ancestor as the containing block instead of the direct parent.

**Why:** This manifests as an image or overlay stretching beyond its intended parent — e.g. a bottom-bar banner image expanding upward to cover sibling elements above it. Desktop browsers resolve against the direct parent correctly; iOS Safari does not always.

**How to apply:**
- Keep `relative` only on the element that is the *intended* containing block for the absolute child.
- Remove `relative` from any outer wrapper that doesn't itself need to contain absolutely-positioned children.
- `z-index` still works on flex/grid items without `position: relative`, so removing `relative` from a flex wrapper doesn't break stacking.

```jsx
// ❌ Breaks on iOS — outer wrapper is also relative
<div className="relative z-10 flex-shrink-0">          {/* outer */}
  <div>...timer...</div>
  <div className="relative flex items-center">          {/* inner */}
    <img className="absolute inset-0 w-full h-full" /> {/* stretches to outer on iOS */}
  </div>
</div>

// ✅ Works everywhere — only the direct parent is relative
<div className="z-10 flex-shrink-0">                   {/* outer — no relative */}
  <div>...timer...</div>
  <div className="relative flex items-center">          {/* inner */}
    <img className="absolute inset-0 w-full h-full" /> {/* correctly bounded */}
  </div>
</div>
```
