---
name: iOS Capacitor flex centering bug
description: justify-content:center on an overflow:hidden flex-column container doesn't center in iOS Safari / Capacitor — content aligns to the top instead
---

## Rule
Never rely on `justify-content: center` (or the Tailwind class `justify-center`) to vertically center content in a `flex-column` container that also has `overflow: hidden` when the app runs inside iOS Safari or a Capacitor WKWebView.

**Why:** WebKit has a long-standing bug where `justify-content: center` is computed before the overflow clip is resolved for flex containers in column direction. The result is the content aligns to the start edge instead of the center — visually it "jumps up" toward the top of the container.

**How to apply:** Replace `justify-center` on the parent with `margin: auto 0` (top + bottom auto) on the inner content wrapper div. This is the correct flex centering idiom and works reliably in all environments.

```jsx
// ❌ Breaks on iOS in Capacitor
<div className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden">
  <Content />
</div>

// ✅ Works everywhere
<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
  <div style={{ margin: "auto 0" }}>
    <Content />
  </div>
</div>
```
