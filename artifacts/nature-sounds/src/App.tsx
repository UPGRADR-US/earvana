import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, Loader2, AlertTriangle } from "lucide-react";

import { CATEGORIES, SoundCategory, SoundTrack } from "./sounds";
import { useAudioEngine } from "./hooks/useAudioEngine";

const queryClient = new QueryClient();
const BASE = import.meta.env.BASE_URL;
const img = (name: string) => `${BASE}${name}`;

// ─── Volume LED Meter ────────────────────────────────────────────────────────

function VolumeMeter({ volume, onChange, bottomPad = "clamp(6px,1vh,12px)" }: {
  volume: number; onChange: (v: number) => void; bottomPad?: string;
}) {
  const meterRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const computeVol = useCallback((clientY: number) => {
    if (!meterRef.current) return;
    const rect = meterRef.current.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)));
  }, [onChange]);

  const onPD = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    computeVol(e.clientY);
  }, [computeVol]);
  const onPM = useCallback((e: React.PointerEvent) => { if (dragging.current) computeVol(e.clientY); }, [computeVol]);
  const onPU = useCallback(() => { dragging.current = false; }, []);

  return (
    <div className="absolute right-0 bottom-0 z-[30] flex items-end gap-[5px]"
      style={{ paddingRight: "clamp(6px, 1.5cqw, 14px)", paddingBottom: bottomPad }}>
      <div ref={meterRef} className="relative cursor-pointer touch-none"
        style={{ width: "clamp(24px, 3.2cqw, 40px)", height: "min(clamp(180px,27svh,262px), calc(100svh - 460px))" }}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} data-testid="vol-meter">
        <img src={img("VolSldrBase.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }} draggable={false} />
        <img src={img("VolSldr_LEDS.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill", clipPath: `inset(${((1 - volume) * 100).toFixed(1)}% 0 0 0)` }}
          draggable={false} />
      </div>
      <div className="flex flex-col items-center justify-center gap-[3px]"
        style={{ fontSize: "clamp(7px, 1.3cqw, 11px)", fontWeight: 300, color: "rgba(255,255,255,0.6)", height: "min(clamp(180px,27svh,262px), calc(100svh - 460px))" }}>
        {"VOLUME".split("").map((ch, i) => <span key={i}>{ch}</span>)}
      </div>
    </div>
  );
}

// ─── Duration Slider ─────────────────────────────────────────────────────────

const DURATION_STEPS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "♋"];

/* step 0 = "1" hr … step 9 = "10" hrs; step 10 = loop (no countdown) */
function stepToSeconds(step: number): number { return (step + 1) * 3600; }

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function DurationSlider({
  step, onChange, timeRemaining, isPlaying,
}: {
  step: number;
  onChange: (s: number) => void;
  timeRemaining: number;   /* seconds; ignored when step===loopStep */
  isPlaying: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [slotActive, setSlotActive] = useState(false); /* true while finger/pointer is down */

  const N        = DURATION_STEPS.length; /* 11 */
  const loopStep = N - 1;

  /*
   * Both the knob and every label use `left: X%` + `transform: translateX(-50%)`.
   * Because both reference the SAME containing block (trackRef), their centres are
   * guaranteed to be at identical screen pixels — no JS measurement needed.
   */
  const pct = (i: number) => `${(i / (N - 1)) * 100}%`;

  const computeStep = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const idx  = Math.round(((clientX - rect.left) / rect.width) * (N - 1));
    onChange(Math.max(0, Math.min(N - 1, idx)));
  }, [onChange, N]);

  const onPD = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    setSlotActive(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    computeStep(e.clientX);
  }, [computeStep]);
  const onPM = useCallback((e: React.PointerEvent) => { if (dragging.current) computeStep(e.clientX); }, [computeStep]);
  const onPU = useCallback(() => { dragging.current = false; setSlotActive(false); }, []);

  return (
    <div ref={trackRef} className="relative w-full touch-none cursor-pointer"
      style={{ height: "clamp(54px,9vh,66px)", touchAction: "none" }}
      onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU}
      data-testid="duration-slider">

      {/* Timer readout — floats above the bar, horizontally aligned with the knob.
          Hidden in loop mode. Uses same pct(step) formula as knob for perfect alignment. */}
      {step < loopStep && (
        <div className="absolute pointer-events-none"
          style={{
            /* bottom: 100% = top of trackRef; add ~24px to clear the space
               between trackRef top and the top edge of the control bar */
            bottom: "calc(100% + 24px)",
            left: pct(step),
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}>
          <span style={{
            color: isPlaying && timeRemaining <= 300
              ? "#ffcc00"
              : isPlaying
                ? "#00ff55"
                : "rgba(0,255,85,0.55)",
            fontSize: "clamp(22px,6cqw,32px)",
            fontWeight: 700,
            letterSpacing: "0.05em",
            fontVariantNumeric: "tabular-nums",
            textShadow: isPlaying && timeRemaining <= 300
              ? "0 0 12px #ffcc00, 0 0 28px #ff9900"
              : isPlaying
                ? "0 0 12px #00ff55, 0 0 28px #00ff33"
                : "0 0 8px rgba(0,255,85,0.3)",
            animation: isPlaying && timeRemaining <= 300
              ? "timerFlash 1.8s ease-in-out infinite"
              : "none",
            transition: "color 0.5s, text-shadow 0.5s",
          }}>
            {formatTime(timeRemaining)}
          </span>
        </div>
      )}

      {/* Labels — centred at i/(N-1)*100% of trackRef width */}
      {DURATION_STEPS.map((label, i) => {
        const active = step === i;
        if (i === loopStep) {
          return (
            <button key={i} onClick={() => onChange(i)}
              className="absolute transition-all duration-150 pointer-events-auto"
              style={{
                top: 0, left: pct(i), transform: "translateX(-50%)",
                width: "clamp(18px,4.5cqw,26px)", opacity: active ? 1 : 0.45, padding: 0,
              }}
              data-testid={`duration-step-${i}`}>
              <img src={img(active ? "LoopIcon(OnCLK).png" : "LoopIcon.png")} alt="loop" className="w-full h-auto" draggable={false} />
            </button>
          );
        }
        return (
          <button key={i} onClick={() => onChange(i)}
            className="absolute leading-none transition-all duration-150 pointer-events-auto"
            style={{
              top: 0, left: pct(i), transform: "translateX(-50%)", padding: 0,
              color: active ? "#00ff55" : "rgba(200,220,255,0.45)",
              textShadow: active ? "0 0 10px #00ff55, 0 0 20px #00ff33" : "none",
              fontWeight: active ? 600 : 300,
              fontSize: "clamp(15px,3.4cqw,21px)",
            }}
            data-testid={`duration-step-${i}`}>{label}</button>
        );
      })}

      {/* Slot base — full-width static track, swaps to OnCLK while pointer is held */}
      <img src={img(slotActive ? "SliderSlot_Base(OnCLK).png" : "SliderSlot_Base.png")} alt=""
        className="absolute w-full pointer-events-none"
        style={{ top: "55%", transform: "translateY(-50%)", height: "clamp(9px,1.3vh,13px)", objectFit: "fill" }}
        draggable={false} />

      {/* Slot meter — mercury fill: full-width image clipped on the right so its
          right edge sits exactly under the knob centre and follows travel */}
      <img src={img("SliderSlot_Meter.png")} alt=""
        className="absolute w-full pointer-events-none"
        style={{
          top: "55%",
          transform: "translateY(-50%)",
          height: "clamp(9px,1.3vh,13px)",
          objectFit: "fill",
          clipPath: `inset(0 ${(1 - step / (N - 1)) * 100}% 0 0)`,
          transition: "clip-path 0.05s ease",
        }}
        draggable={false} />

      {/* Knob — centred at step/(N-1)*100%, same formula as labels, perfect alignment.
          Drop shadow added in code since the PNG is exported without one. */}
      <div className="absolute pointer-events-none"
        style={{
          top: "55%",
          left: pct(step),
          transform: "translateX(-50%) translateY(-50%)",
          width: "clamp(16px,3.5cqw,22px)",
          height: "clamp(20px,3.6vh,26px)",
          filter: "drop-shadow(2px 3px 5px rgba(0,0,0,0.70))",
        }}>
        <img src={img("SliderKnob.png")} alt="" className="w-full h-full" style={{ objectFit: "fill" }} draggable={false} />
      </div>

    </div>
  );
}

// ─── 3D Cylinder Carousel ─────────────────────────────────────────────────────
//
// Each item has a FIXED absolute angle on the cylinder: rotateY(i * ANGLE_STEP).
// ALL motion comes from a single `rotation` value on the container: rotateY(-rotation).
// Snap target = round(rotation / ANGLE_STEP) * ANGLE_STEP — always the nearest slot,
// always ≤ ANGLE_STEP/2 from the drag end, always correct direction. No sign bugs.

const N          = CATEGORIES.length;   // 11
const ANGLE_STEP = 360 / N;             // ~32.73°
const CYLINDER_R = 158;                 // px  (198 × 0.8 — 20% smaller so sides stay on screen)
const SLAB_DEPTH = 5;                   // px — tile physical depth
// At CYLINDER_R=212px the arc length per degree is ~3.7px, so 0.25 deg/px ≈ 1:1 finger tracking.
const DRAG_SENS  = 0.25;               // deg per pixel

// Normalise any angle to −180..+180 (shortest arc from viewer)
function shortArc(deg: number): number {
  const m = ((deg % 360) + 360) % 360;
  return m > 180 ? m - 360 : m;
}

// Per-face opacity — fades distant tiles to zero, full brightness for front tiles.
// Must NOT be applied to the tile container (breaks preserve-3d); faces only.
function tileOpacity(visAngleDeg: number): number {
  const a = Math.abs(visAngleDeg);
  return a < 98 ? 1 : a < 172 ? 1 - ((a - 98) / 74) * 0.78 : 0;
}

const EDGE_RIGHT  = "linear-gradient(to right,  #22435e, #162c40)";
const EDGE_LEFT   = "linear-gradient(to left,   #22435e, #162c40)";
const EDGE_TOP    = "#1a3a52";
const EDGE_BOTTOM = "#09141e";

function CylinderCarousel({
  centerIdx, selectedId, onSelect, onCenterChange, engine,
}: {
  centerIdx: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCenterChange: (idx: number) => void;
  engine: ReturnType<typeof useAudioEngine>;
}) {
  // Absolute cumulative rotation (degrees). Container = rotateY(-rotation).
  // Item i is at front when rotation ≈ i * ANGLE_STEP (mod 360).
  // Drag left → rotation increases → right-side items come forward.
  const [rotation,    setRotation]    = useState(centerIdx * ANGLE_STEP);
  const rotRef                        = useRef(centerIdx * ANGLE_STEP);
  const [isAnimating, setIsAnimating] = useState(false);
  const isDragging                    = useRef(false);
  // didDrag stays true after a drag so the click that browser fires right after
  // pointerup doesn't accidentally trigger animateTo / onSelect.
  const didDrag                       = useRef(false);
  const dragStartX                    = useRef<number | null>(null);
  const dragStartRot                  = useRef(0);

  // Snap with directional commitment.
  // Uses Math.round for natural large-drag behaviour (no slot-skipping),
  // but guarantees ≥1 step in the drag direction for any intentional swipe (> 1°).
  // Tiny jitter (≤1°) just snaps to nearest without moving.
  const snapCommitted = (dragDelta: number) => {
    const startSlot = Math.round(dragStartRot.current / ANGLE_STEP);
    const nearest   = Math.round(rotRef.current / ANGLE_STEP);
    // Threshold ~0.75° ≈ 3px — safely below 1% of a 390px screen so a deliberate
    // flick always commits, but a pure tap (≤2px of jitter) stays put.
    const committed =
      dragDelta >  0.75 ? Math.max(nearest, startSlot + 1) :  // left  → at least +1
      dragDelta < -0.75 ? Math.min(nearest, startSlot - 1) :  // right → at least −1
                          nearest;                             // tap / jitter → nearest
    const target    = committed * ANGLE_STEP;
    const newCenter = ((committed % N) + N) % N;
    rotRef.current  = target;
    setRotation(target);
    setIsAnimating(true);
    onCenterChange(newCenter);
  };

  // Animated tap-to-centre: find shortest-arc path and spin there.
  const animateTo = (i: number) => {
    const snap      = Math.round(rotRef.current / ANGLE_STEP) * ANGLE_STEP;
    const cur       = ((Math.round(snap / ANGLE_STEP) % N) + N) % N;
    let   steps     = ((i - cur) % N + N) % N;
    if (steps > N / 2) steps -= N;          // take the short arc
    const target    = snap + steps * ANGLE_STEP;
    rotRef.current  = target;
    setRotation(target);
    setIsAnimating(true);
    onCenterChange(i);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setIsAnimating(false);           // interrupt any in-flight animation
    isDragging.current   = true;
    didDrag.current      = false;    // reset per-gesture
    dragStartX.current   = e.clientX;
    dragStartRot.current = rotRef.current;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || dragStartX.current === null) return;
    const px = e.clientX - dragStartX.current;
    // Mark as a real drag once finger travels more than 4px
    if (Math.abs(px) > 4) didDrag.current = true;
    const r        = dragStartRot.current - px * DRAG_SENS;
    rotRef.current = r;
    setRotation(r);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const pxDelta = dragStartX.current !== null ? dragStartX.current - e.clientX : 0;
    dragStartX.current = null;
    snapCommitted(pxDelta * DRAG_SENS);
    // didDrag stays true — the browser fires click right after pointerup and we
    // need to suppress it. It is cleared inside the tile onClick handler below.
  };

  // cqw = width of the nearest container ancestor (the carousel div below).
  // This gives us sizes relative to the actual 430px column, not the full viewport.
  const thumbSize = "clamp(78px, 21cqw, 104px)";  // 20% smaller than previous

  return (
    <div className="relative w-full touch-none"
      style={{
        height: "clamp(134px, 34cqw, 192px)",  // 20% smaller than previous
        perspective: "820px",
        perspectiveOrigin: "50% 50%",
        containerType: "inline-size",   // makes cqw resolve against THIS element's width
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}>

      {/* Single cylinder container — its rotateY drives everything.
          isAnimating enables the CSS transition for snap/tap; during drag it's off. */}
      <div className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateY(${-rotation}deg)`,
          transition: isAnimating
            ? "transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)"
            : "none",
        }}>

        {CATEGORIES.map((cat, i) => {
          // Fixed absolute angle on the cylinder. Container rotation does all the work.
          const itemAngle = i * ANGLE_STEP;
          // Visual angle currently shown to the viewer (−180..+180).
          const visAngle  = shortArc(itemAngle - rotation);
          const absVis    = Math.abs(visAngle);

          if (absVis > 172) return null;   // in the back — invisible, skip rendering

          const isCentered  = absVis < ANGLE_STEP / 2;
          const isSelected  = cat.id === selectedId;
          const hasPlaying  = cat.tracks.some((t) => engine.tracks[t.id]?.isPlaying);
          const faceOpacity = tileOpacity(visAngle);
          // Only apply shadow to the centred tile — side tiles are rotated in 3D
          // and a 2D box-shadow bleeds around the projected shape, creating
          // visible artefacts at the corners.
          const frontShadow = isCentered
            ? "0 14px 32px rgba(0,0,0,0.85), 0 3px 10px rgba(0,0,0,0.6)"
            : "none";

          return (
            // Tile container: preserve-3d so slab faces sit in 3D space.
            // NO opacity/filter here — either breaks preserve-3d on children.
            <div key={cat.id}
              style={{
                position: "absolute", left: "50%", top: "50%",
                transform: `translate(-50%,-50%) rotateY(${itemAngle}deg) translateZ(${CYLINDER_R}px)`,
                width: thumbSize, height: thumbSize,
                transformStyle: "preserve-3d",
                cursor: isCentered ? "default" : "pointer",
              }}
              onClick={() => {
                // Suppress click that browser fires immediately after a drag gesture
                if (didDrag.current) { didDrag.current = false; return; }
                if (isCentered) onSelect(cat.id);
                else animateTo(i);
              }}>

              {/* Front face */}
              <div className="absolute inset-0 rounded-xl overflow-hidden"
                style={{
                  opacity: faceOpacity,
                  border: isCentered || isSelected
                    ? "2px solid rgba(0,255,100,0.8)"
                    : "2px solid rgba(255,255,255,0.20)",
                  boxShadow: isCentered || isSelected
                    ? `${frontShadow}, inset 0 0 0 1px rgba(0,255,80,0.25)`
                    : frontShadow,
                }}>
                <img src={img(cat.thumbnail)} alt={cat.name}
                  className="w-full h-full object-cover" draggable={false} />

                {hasPlaying && (
                  <div className="absolute top-[6px] right-[6px] rounded-full"
                    style={{ width:8, height:8, background:"#00ff55", boxShadow:"0 0 6px #00ff55" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Track List ───────────────────────────────────────────────────────────────

function TrackList({ category, engine }: { category: SoundCategory; engine: ReturnType<typeof useAudioEngine> }) {
  return (
    <div className="w-full h-full overflow-y-auto">
      {category.tracks.map((track: SoundTrack, i: number) => {
        const state     = engine.tracks[track.id];
        const isPlaying = state?.isPlaying ?? false;
        const isLoading = state?.isLoading ?? false;
        const hasError  = state?.hasError  ?? false;

        return (
          <button key={track.id}
            onClick={() => isPlaying ? engine.pause(track.id) : engine.play(track.id)}
            className="w-full flex items-center gap-3 py-[9px] text-left"
            style={{
              paddingLeft: "clamp(38px,9cqw,48px)", paddingRight: "16px",
              background: "transparent",
              transformOrigin: "top center",
              animation: `blindDown 0.28s ease both`,
              animationDelay: `${i * 0.07}s`,
            }}
            data-testid={`track-btn-${track.id}`}>
            <div className="flex-shrink-0 flex items-center justify-start transition-all duration-200"
              style={{
                width: "clamp(26px,4cqw,34px)", height: "clamp(26px,4cqw,34px)", transform: "translateY(1px)",
              }}>
              {isLoading ? <Loader2 className="animate-spin text-white/60" style={{ width: "clamp(18px,3.5cqw,22px)", height: "clamp(18px,3.5cqw,22px)" }} />
                : hasError  ? <AlertTriangle style={{ width: "clamp(18px,3.5cqw,22px)", height: "clamp(18px,3.5cqw,22px)", color: "rgba(255,180,0,0.7)" }} />
                : isPlaying ? <Pause style={{ width: "clamp(18px,3.5cqw,22px)", height: "clamp(18px,3.5cqw,22px)", color: "#00ff55" }} />
                : <Play style={{ width: "clamp(18px,3.5cqw,22px)", height: "clamp(18px,3.5cqw,22px)", color: "rgba(255,255,255,0.5)" }} />}
            </div>
            <span className="leading-none" style={{
              fontSize: "clamp(15px,4.0cqw,20px)", fontWeight: isPlaying ? 500 : 300,
              color: isPlaying ? "#00ff88" : hasError ? "rgba(255,180,0,0.6)" : "rgba(220,240,255,0.8)",
              textShadow: isPlaying ? "0 0 12px rgba(0,255,80,0.4)" : "none",
              letterSpacing: "0.03em",
            }}>
              {track.name}
              {hasError && <span style={{ fontSize: "0.8em", opacity: 0.65 }}> — file not found</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

// ─── Settings Panel ───────────────────────────────────────────────────────────

const EQ_MODES = [
  { id: "normal",   label: "Normal",   sub: ""                      },
  { id: "hf_boost", label: "HF Boost", sub: "crisper"               },
  { id: "hf_cut",   label: "HF Cut",   sub: "duller"                },
  { id: "lf_boost", label: "LF Boost", sub: "warmer"                },
  { id: "lf_cut",   label: "LF Cut",   sub: "thinner"               },
  { id: "custom",   label: "Custom",   sub: "5-band · coming soon"  },
] as const;
type EqModeId = typeof EQ_MODES[number]["id"];

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "How can this help mask my tinnitus?",
    a: "Nature sounds provide a steady broadband signal that partially or fully masks the phantom ringing in your ears, gradually shifting your auditory focus away from it. With regular use many listeners report the perceived loudness of their tinnitus decreases over time." },
  { q: "Which audio tracks will work best for my tinnitus frequency?",
    a: "High-frequency tinnitus (ringing, hissing) responds well to Ocean, Rain, or White/Pink-Wave. Low-frequency tinnitus (hum, roar) benefits from Streams, Forests, or Wind. Start with Ocean Night-Calm or White-Wave — they cover the widest range of tinnitus frequencies." },
  { q: "How do I set the timer?",
    a: "Tap the duration bar at the bottom of the screen to select 1–10 hours, or tap the ∞ icon at the far right for continuous playback. A countdown timer appears above the bar while a track is playing." },
  { q: "What are the recommended speakers for Earvana audio?",
    a: "Any quality speaker or headphone works well. For bedside use, a small Bluetooth speaker rated down to 80 Hz or lower is ideal. Over-ear headphones deliver the most immersive experience." },
  { q: "Can I use this with my Bluetooth ear pods?",
    a: "Yes — connect your AirPods or Bluetooth earbuds before pressing play. Audio routes automatically through your device's active output. AirPods in Transparency mode can further enhance the masking effect." },
  { q: "Can I play this through my TV system?",
    a: "Yes. On iPhone/iPad use AirPlay in Control Center to stream to an Apple TV or compatible soundbar. On Android use Chromecast or Bluetooth to your TV's audio system." },
  { q: "How can I cancel my subscription?",
    a: "Go to Settings → your name → Subscriptions on iPhone/iPad, or Google Play → Account → Subscriptions on Android. Find Tinnitus Relief by Earvana and tap Cancel. Access continues through the end of your current billing period." },
  { q: "Will there be new tracks added in the future?",
    a: "Yes — new sound categories and tracks are in production and delivered automatically to all subscribers at no additional charge." },
];

const PRIVACY_POLICY = `Effective: May 2025

Earvana LLC ("we") is committed to protecting your privacy.

DATA WE COLLECT
Tinnitus Relief by Earvana does not collect, transmit, or store any personal information. No account or login is required. All preferences are stored locally on your device only and are never sent to our servers.

SUBSCRIPTIONS
Subscription billing is managed entirely by Apple App Store or Google Play. We do not access your payment information. Please refer to Apple's or Google's privacy policies for details.

ANALYTICS
We do not use third-party analytics or tracking SDKs.

CHILDREN'S PRIVACY
This app does not knowingly collect data from children under 13.

CONTACT
privacy@earvana.com`;

const TERMS_OF_SERVICE = `Effective: May 2025

By using Tinnitus Relief by Earvana ("the App") you agree to these Terms.

LICENSE
Earvana LLC grants you a personal, non-transferable, non-exclusive license to use the App for personal, non-commercial purposes only.

RESTRICTIONS
You may not: (a) record or redistribute any audio content; (b) reverse-engineer or decompile the App; (c) use the App for commercial purposes without written consent from Earvana LLC.

MEDICAL DISCLAIMER
This App is a sound-masking and relaxation aid only. It is not a medical device and makes no claims to diagnose, treat, cure, or prevent any medical condition including tinnitus. Always consult a licensed audiologist or physician for tinnitus-related medical advice.

SUBSCRIPTIONS
Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date.

DISCLAIMER OF WARRANTIES
The App is provided "as is" without warranty of any kind. Earvana LLC is not liable for any direct, indirect, or incidental damages arising from use of the App.

GOVERNING LAW
These Terms are governed by the laws of the State of California, USA.

© 2025 Earvana LLC. All rights reserved.`;

function SettingsRow({ label, isOpen, onToggle, children }: {
  label: string; isOpen: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "5px" }}>
      <button onClick={onToggle}
        className="w-full text-left flex items-center"
        style={{
          padding: "11px 14px", gap: "10px",
          background: "rgba(0,15,40,0.28)",
          borderRadius: isOpen ? "8px 8px 0 0" : "8px",
          border: "none", cursor: "pointer",
        }}>
        <span style={{ color: "#00c8ff", fontFamily: "monospace", fontSize: "14px", width: "12px", flexShrink: 0, lineHeight: 1 }}>
          {isOpen ? "∨" : ">"}
        </span>
        <span style={{ color: "#00c8ff", fontSize: "15px", letterSpacing: "0.06em" }}>
          {label}
        </span>
      </button>
      {isOpen && children && (
        <div style={{ background: "rgba(0,10,30,0.20)", borderRadius: "0 0 8px 8px", padding: "12px 14px 16px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ onClose, eqMode, onEqChange }: {
  onClose: () => void;
  eqMode: EqModeId;
  onEqChange: (m: EqModeId) => void;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openSub,     setOpenSub]     = useState<string | null>(null);
  const [reviewText,  setReviewText]  = useState("");
  const [reviewSent,  setReviewSent]  = useState(false);
  const [xFlash,      setXFlash]      = useState(false);

  const handleClose = () => { setXFlash(true); setTimeout(() => { setXFlash(false); onClose(); }, 200); };

  const toggleSection = (s: string) => {
    setOpenSub(null);
    setOpenSection(o => o === s ? null : s);
  };
  const toggleSub = (key: string) => setOpenSub(o => o === key ? null : key);

  const handleReviewSubmit = () => {
    if (!reviewText.trim()) return;
    setReviewSent(true); setReviewText("");
    setTimeout(() => setReviewSent(false), 3500);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ animation: "settingsPop 0.22s cubic-bezier(0.34,1.56,0.64,1) both" }}>

      {/* X close button — top-left of screen */}
      <button onClick={handleClose}
        style={{
          position: "absolute", top: "4.5%", left: "5%", zIndex: 10,
          background: "none", border: "none", cursor: "pointer", padding: "10px", lineHeight: 1,
          color: xFlash ? "#00ffcc" : "rgba(255,255,255,0.82)", fontSize: "24px",
          textShadow: xFlash ? "0 0 16px #00ffcc, 0 0 36px #00ffaa, 0 0 60px #00ff88" : "0 2px 8px rgba(0,0,0,0.9)",
          transition: "color 0.12s, text-shadow 0.12s",
        }}>✕</button>

      {/* Panel */}
      <div className="relative" style={{ width: "88%", maxWidth: "390px", height: "88svh", maxHeight: "760px" }}>
        <img src={img("settings-pane.png")} alt=""
          className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />

        <div className="absolute inset-0 overflow-y-auto"
          style={{ paddingTop: "28%", paddingLeft: "5%", paddingRight: "5%", paddingBottom: "6%" }}>

          {/* AUDIO */}
          <SettingsRow label="audio" isOpen={openSection === "audio"} onToggle={() => toggleSection("audio")}>
            {/* EQ/SOUND — 1 tab indent */}
            <div style={{ paddingLeft: "14px" }}>
              <div style={{ marginBottom: "8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)" }}>
                EQ / SOUND:
              </div>
              {/* Presets — 2 tab indent */}
              <div style={{ paddingLeft: "14px" }}>
                {EQ_MODES.map(m => (
                  <button key={m.id} onClick={() => m.id !== "custom" && onEqChange(m.id as EqModeId)}
                    className="block w-full text-left"
                    style={{ padding: "4px 0", background: "none", border: "none", cursor: m.id === "custom" ? "default" : "pointer" }}>
                    <span style={{ color: eqMode === m.id ? "#00ff55" : m.id === "custom" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.78)", fontSize: "13px", fontWeight: eqMode === m.id ? 700 : 400 }}>
                      {">"}&nbsp;{m.label}
                    </span>
                    {m.sub && <span style={{ color: "rgba(255,255,255,0.32)", fontSize: "11px", marginLeft: "6px" }}>({m.sub})</span>}
                  </button>
                ))}
              </div>
            </div>
          </SettingsRow>

          {/* MY SUBSCRIPTION */}
          <SettingsRow label="my subscription" isOpen={openSection === "sub"} onToggle={() => toggleSection("sub")}>
            {/* Items — 1 tab indent */}
            <div style={{ paddingLeft: "14px" }}>
              {([
                { label: "restore on a new device",
                  action: () => alert("Sign in to the App Store with the same Apple ID used when you subscribed, then re-download the app — your subscription will restore automatically.") },
                { label: "cancel my subscription",
                  action: () => window.open("https://support.apple.com/en-us/118428", "_blank") },
              ] as { label: string; action: () => void }[]).map((item, i, arr) => (
                <button key={i} onClick={item.action} className="block w-full text-left"
                  style={{ padding: "9px 0", background: "none", border: "none", cursor: "pointer",
                    borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                    color: "rgba(255,255,255,0.78)", fontSize: "13px" }}>
                  <span style={{ color: "#00c8ff", marginRight: "8px" }}>{">"}</span>{item.label}
                </button>
              ))}
            </div>
          </SettingsRow>

          {/* LEAVE A REVIEW */}
          <SettingsRow label="leave a review" isOpen={openSection === "review"} onToggle={() => toggleSection("review")}>
            {/* Content — 1 tab indent */}
            <div style={{ paddingLeft: "14px" }}>
              {reviewSent
                ? <div style={{ color: "#00ff55", fontSize: "14px", padding: "4px 0" }}>Thank you for your feedback! ✓</div>
                : <>
                    <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} rows={4}
                      placeholder="Share your experience with Tinnitus Relief by Earvana…"
                      style={{ width: "100%", background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: "6px", color: "rgba(255,255,255,0.88)", fontSize: "13px",
                        padding: "8px", resize: "none", boxSizing: "border-box" }} />
                    <button onClick={handleReviewSubmit}
                      style={{ marginTop: "8px", padding: "7px 20px", background: "rgba(0,180,90,0.18)",
                        border: "1px solid rgba(0,255,100,0.35)", borderRadius: "6px",
                        color: "#00ee88", fontSize: "13px", cursor: "pointer", letterSpacing: "0.04em" }}>
                      Submit
                    </button>
                  </>
              }
            </div>
          </SettingsRow>

          {/* FAQ */}
          <SettingsRow label="faq" isOpen={openSection === "faq"} onToggle={() => toggleSection("faq")}>
            {/* Questions — 1 tab indent; answers — 2 tab indent */}
            <div style={{ paddingLeft: "14px" }}>
              {FAQ_ITEMS.map((item, i) => (
                <div key={i}>
                  <button onClick={() => toggleSub(`faq-${i}`)} className="w-full text-left flex items-start"
                    style={{ gap: "8px", padding: "8px 0", background: "none", border: "none", cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ color: "#00c8ff", fontSize: "11px", lineHeight: "18px", flexShrink: 0 }}>
                      {openSub === `faq-${i}` ? "∨" : ">"}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.78)", fontSize: "12px", lineHeight: 1.45, textAlign: "left" }}>
                      {item.q}
                    </span>
                  </button>
                  {openSub === `faq-${i}` && (
                    <div style={{ padding: "7px 4px 9px 14px", color: "rgba(255,255,255,0.55)", fontSize: "12px", lineHeight: 1.55 }}>
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SettingsRow>

          {/* LEGAL */}
          <SettingsRow label="legal" isOpen={openSection === "legal"} onToggle={() => toggleSection("legal")}>
            {/* Doc rows — 1 tab indent; expanded text — 2 tab indent */}
            <div style={{ paddingLeft: "14px" }}>
              {([
                { key: "privacy", label: "PRIVACY POLICY",   text: PRIVACY_POLICY   },
                { key: "terms",   label: "TERMS OF SERVICE", text: TERMS_OF_SERVICE },
              ] as { key: string; label: string; text: string }[]).map(doc => (
                <div key={doc.key}>
                  <button onClick={() => toggleSub(`legal-${doc.key}`)} className="w-full text-left flex items-center"
                    style={{ gap: "8px", padding: "9px 0", background: "none", border: "none", cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ color: "#00c8ff", fontSize: "11px" }}>{openSub === `legal-${doc.key}` ? "∨" : ">"}</span>
                    <span style={{ color: "rgba(255,255,255,0.78)", fontSize: "12px", letterSpacing: "0.06em" }}>{doc.label}</span>
                  </button>
                  {openSub === `legal-${doc.key}` && (
                    <div style={{ padding: "8px 4px 10px 14px", color: "rgba(255,255,255,0.45)", fontSize: "11px", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                      {doc.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SettingsRow>

        </div>
      </div>
    </div>
  );
}

function Home() {
  const engine = useAudioEngine();
  const [durationStep, setDurationStep] = useState<number>(10);
  const [centerIdx,   setCenterIdx]   = useState<number>(() => {
    const saved = localStorage.getItem("tr_last_category");
    const id    = saved ?? "oceans";
    const idx   = CATEGORIES.findIndex((c) => c.id === id);
    return idx >= 0 ? idx : 0;
  });
  const [selectedId,  setSelectedId]  = useState<string | null>(() => {
    const saved = localStorage.getItem("tr_last_category");
    const id    = saved ?? "oceans";
    return CATEGORIES.some((c) => c.id === id) ? id : CATEGORIES[0].id;
  });
  const [settingsOpen,  setSettingsOpen]  = useState<boolean>(false);
  const [sprocketFlash, setSprocketFlash] = useState<boolean>(false);
  const [eqMode,        setEqMode]        = useState<EqModeId>(
    () => (localStorage.getItem("tr_eq_mode") as EqModeId | null) ?? "normal"
  );

  /* ── Timer ───────────────────────────────────────────────────────────────── */
  const LOOP_STEP = DURATION_STEPS.length - 1;
  const [timeRemaining, setTimeRemaining] = useState<number>(
    durationStep < LOOP_STEP ? stepToSeconds(durationStep) : 0,
  );

  /* Reset to full duration whenever the user moves the slider (only when stopped) */
  const handleDurationChange = useCallback((s: number) => {
    setDurationStep(s);
    if (s < LOOP_STEP) setTimeRemaining(stepToSeconds(s));
  }, [LOOP_STEP]);

  const isPlaying    = Object.values(engine.tracks).some((t) => t.isPlaying);
  const playingTrackId = Object.entries(engine.tracks).find(([, s]) => s.isPlaying)?.[0] ?? null;

  /* Count down once per second while playing (not in loop mode) */
  useEffect(() => {
    if (!isPlaying || durationStep >= LOOP_STEP) return;
    const id = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, durationStep, LOOP_STEP]);

  /* At exactly 5 minutes remaining: start the exponential fade-out.
     At 0:00: auto-stop and reset. */
  useEffect(() => {
    if (!isPlaying || durationStep >= LOOP_STEP) return;
    if (timeRemaining === 300) {
      engine.startFadeOut(300);
    }
    if (timeRemaining === 0) {
      if (playingTrackId) engine.pause(playingTrackId);
      engine.cancelFade();
      setTimeRemaining(stepToSeconds(durationStep));
    }
  // engine methods are stable useCallback refs — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining]);

  /* Cancel fade whenever playback stops (manual or auto) */
  useEffect(() => {
    if (!isPlaying) engine.cancelFade();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    localStorage.setItem("tr_last_category", id);
  };
  const handleCenterChange = (idx: number) => {
    const id = CATEGORIES[idx].id;
    setCenterIdx(idx);
    setSelectedId(id);
    localStorage.setItem("tr_last_category", id);
  };

  const handleSprocketClick = useCallback(() => {
    setSprocketFlash(true);
    setTimeout(() => { setSprocketFlash(false); setSettingsOpen(true); }, 180);
  }, []);

  const handleEqChange = useCallback((mode: EqModeId) => {
    setEqMode(mode);
    localStorage.setItem("tr_eq_mode", mode);
  }, []);

  const handleSpeakerClick = useCallback(() => {
    /* On iOS Safari, webkitShowPlaybackTargetPicker() opens the native
       AirPlay / route-picker sheet (internal speaker, Bluetooth, AirPlay). */
    const audios = document.getElementsByTagName("audio");
    if (audios.length > 0) {
      const el = audios[0] as HTMLAudioElement & { webkitShowPlaybackTargetPicker?: () => void };
      if (typeof el.webkitShowPlaybackTargetPicker === "function") {
        el.webkitShowPlaybackTargetPicker();
      }
    }
  }, []);

  return (
    <div className="relative flex flex-col w-full overflow-hidden select-none"
      style={{ height: "100svh", boxSizing: "border-box", paddingTop: "env(safe-area-inset-top)", touchAction: "none", overscrollBehavior: "none" }}>

      {/* Full-screen background — always visible */}
      <img src={img("bg.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover z-0" draggable={false} />

      {/* Settings overlay — hides all other UI when open */}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          eqMode={eqMode}
          onEqChange={handleEqChange}
        />
      )}

      {!settingsOpen && (
        <>
          {/* Top Banner */}
          <div className="relative z-10 flex-shrink-0 w-full">
            <img src={img("banner.png")} alt="tinnitus relief by earvana with AUDIO-MERSIVE technology"
              className="w-full h-auto block" draggable={false} />
          </div>

          {/* Volume meter */}
          <VolumeMeter
            volume={engine.masterVolume}
            onChange={engine.setMasterVolume}
            bottomPad="clamp(180px,27vh,228px)"
          />

          {/* Carousel */}
          <div className="relative flex-shrink-0 z-10" style={{ overflow: "visible" }}>
            <div className="pb-1" style={{ paddingLeft: "8px", paddingRight: "8px", marginTop: "0" }}>
              <CylinderCarousel
                centerIdx={centerIdx}
                selectedId={selectedId}
                onSelect={handleSelect}
                onCenterChange={handleCenterChange}
                engine={engine}
              />
            </div>
          </div>

          {/* Track list */}
          <div className="relative flex-1 min-h-0 z-10 overflow-hidden" style={{ paddingTop: "clamp(4px,0.8vh,8px)", paddingBottom: "4px" }}>
            {selectedId && (() => {
              const cat = CATEGORIES.find((c) => c.id === selectedId);
              return cat ? <TrackList category={cat} engine={engine} /> : null;
            })()}
          </div>

          {/* Bottom control bar — two-row layout */}
          <div className="relative z-10 flex-shrink-0"
            style={{ height: `calc(clamp(175px,25vh,220px) + env(safe-area-inset-bottom, 0px))`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <img src={img("banner-btm.png")} alt="" className="absolute inset-0 w-full h-full"
              style={{ objectFit: "fill" }} draggable={false} />

            <div className="relative z-10 w-full h-full">

              {/* Duration slider — absolutely placed, low in the bar just above icon row */}
              <div className="absolute left-0 right-0"
                style={{ bottom: "clamp(68px,9.5vh,88px)", paddingLeft: "52px", paddingRight: "44px" }}>
                <DurationSlider
                  step={durationStep}
                  onChange={handleDurationChange}
                  timeRemaining={timeRemaining}
                  isPlaying={isPlaying}
                />
                {/* -19px pulls text up to just below the slot (slot bottom ≈ sliderHeight×0.55 + slotHeight/2) */}
                <div style={{ textAlign: "center", fontSize: "clamp(9px,2.2cqw,12px)", color: "rgba(255,255,255,0.45)", letterSpacing: "0.07em", marginTop: "-19px" }}>
                  duration (hours)
                </div>
              </div>

              {/* Icon row — absolutely pinned to bottom */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center"
                style={{ paddingLeft: "38px", paddingRight: "30px", paddingBottom: "clamp(4px,0.6vh,8px)", paddingTop: "2px" }}>
                {/* Speaker */}
                <button onClick={handleSpeakerClick}
                  className="flex-shrink-0 transition-opacity duration-150 active:opacity-50"
                  style={{ width: "clamp(22px,5.5cqw,30px)" }} data-testid="btn-speaker">
                  <img src={img("SpkrIcon.png")} alt="Audio output" className="w-full h-auto" draggable={false} />
                </button>
                {/* Play — truly centered across full bar width */}
                <div className="absolute inset-x-0 flex justify-center pointer-events-none"
                  style={{ bottom: "clamp(4px,0.6vh,8px)", paddingBottom: "0" }}>
                  <button onClick={() => { if (isPlaying && playingTrackId) engine.pause(playingTrackId); else engine.resume(); }}
                    className="pointer-events-auto flex-shrink-0 transition-opacity duration-150 active:opacity-60"
                    style={{ width: "clamp(56px,14cqw,82px)" }} data-testid="btn-play-pause">
                    <img src={isPlaying ? img("PLAY_ON.png") : img("PLAY_standby.png")}
                      alt={isPlaying ? "Stop" : "Play"} className="w-full h-auto" draggable={false} />
                  </button>
                </div>
                {/* Sprocket — pinned right */}
                <div className="flex-1" />
                <button onClick={handleSprocketClick}
                  className="flex-shrink-0 transition-opacity duration-150 hover:opacity-80"
                  style={{ width: "clamp(64px,16cqw,84px)" }} data-testid="btn-settings">
                  <img src={sprocketFlash ? img("Settings_Sprocket(OnCLK).png") : img("Settings_Sprocket.png")}
                    alt="Settings" className="w-full h-auto" draggable={false} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────

function Router() {
  return <Switch><Route path="/" component={Home} /></Switch>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {/* Max-width shell: constrains to 430px on desktop, full-width on mobile.
              container-type lets child cqw units resolve against this column width. */}
          <div style={{ maxWidth: "430px", width: "100%", margin: "0 auto", height: "100dvh", containerType: "inline-size" }}>
            <Router />
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
