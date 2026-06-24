import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

import { CATEGORIES, SoundCategory, SoundTrack } from "./sounds";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

const queryClient = new QueryClient();
const BASE = import.meta.env.BASE_URL;
const img = (name: string) => `${BASE}${name}`;

const BUILD_NUMBER = 23;

// ─── Volume LED Meter ────────────────────────────────────────────────────────

function VolumeMeter({ volume, onChange, extraStyle }: {
  volume: number; onChange: (v: number) => void; extraStyle?: React.CSSProperties;
}) {
  const meterRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pressed, setPressed] = useState(false);

  const computeVol = useCallback((clientY: number) => {
    if (!meterRef.current) return;
    const rect = meterRef.current.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)));
  }, [onChange]);

  const onPD = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    setPressed(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    computeVol(e.clientY);
  }, [computeVol]);
  const onPM = useCallback((e: React.PointerEvent) => { if (dragging.current) computeVol(e.clientY); }, [computeVol]);
  const onPU = useCallback(() => { dragging.current = false; setPressed(false); }, []);

  return (
    <div className="absolute right-0 z-[30] flex items-end gap-[5px]"
      style={{ paddingRight: "clamp(6px, 1.5cqw, 14px)", bottom: 0, ...extraStyle }}>
      {/* Meter images fade with press; VOLUME label stays fully opaque */}
      <div ref={meterRef} className="relative cursor-pointer touch-none"
        style={{
          height: "clamp(150px, 27svh, 250px)",
          WebkitTouchCallout: "none", userSelect: "none",
          opacity: pressed ? 1 : 0.5,
          transition: "opacity 0.15s ease",
        }}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} data-testid="vol-meter">
        <img src={img("VolSldrBase.png")} alt=""
          className="block h-full w-auto pointer-events-none" draggable={false} />
        <img src={img("VolSldr_LEDS.png")} alt=""
          className="absolute top-0 left-0 h-full w-auto pointer-events-none"
          style={{ clipPath: `inset(${((1 - volume) * 100).toFixed(1)}% 0 0 0)` }}
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
          Hidden in loop mode. While playing it slides left continuously in sync
          with timeRemaining — position = (timeRemaining/3600 - 1) / (N-1) * 100%. */}
      {step < loopStep && !slotActive && (
        <div className="absolute pointer-events-none"
          style={{
            bottom: "calc(100% + 10px)",
            left: isPlaying
              ? `${Math.max(0, (timeRemaining / 3600 - 1) / (N - 1)) * 100}%`
              : pct(step),
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            transition: isPlaying ? "left 1s linear" : "none",
          }}>
          <span style={{
            color: isPlaying && timeRemaining <= 300
              ? "#ff2020"
              : isPlaying
                ? "#00ff55"
                : "rgba(0,255,85,0.55)",
            fontSize: "clamp(11px,3cqw,16px)",
            fontWeight: 700,
            letterSpacing: "0.05em",
            fontVariantNumeric: "tabular-nums",
            textShadow: isPlaying && timeRemaining <= 300
              ? "0 0 12px #ff2020, 0 0 28px #cc0000"
              : isPlaying
                ? "0 0 12px #00ff55, 0 0 28px #00ff33"
                : "0 0 8px rgba(0,255,85,0.3)",
            animation: isPlaying && timeRemaining <= 300
              ? "timerFlash 1.8s ease-in-out infinite"
              : "none",
            transition: "text-shadow 0.5s",
          }}>
            {formatTime(timeRemaining)}
          </span>
        </div>
      )}

      {/* Labels — centred at i/(N-1)*100% of trackRef width */}
      {(() => {
        // A marker at step i (label = i+1 hours) lights up once the countdown
        // reaches that exact hour mark — i.e. timeRemaining ≤ (i+1)*3600 —
        // and stays lit for the remainder of the countdown. Markers only light
        // up to the left of the knob (i < step); the knob itself stays green
        // via knobActive regardless.
        const counting = isPlaying && step < loopStep;

        return DURATION_STEPS.map((label, i) => {
          const knobActive     = step === i;
          const countdownActive = counting && i < step && timeRemaining <= (i + 1) * 3600;
          const highlighted    = knobActive || countdownActive;

          if (i === loopStep) {
            return (
              <button key={i} onClick={() => onChange(i)}
                className="absolute transition-all duration-150 pointer-events-auto"
                style={{
                  top: 0, left: pct(i), transform: "translateX(-50%)",
                  width: "clamp(18px,4.5cqw,26px)", opacity: knobActive ? 1 : 0.45, padding: 0,
                }}
                data-testid={`duration-step-${i}`}>
                <img src={img(knobActive ? "LoopIcon(OnCLK).png" : "LoopIcon.png")} alt="loop" className="w-full h-auto" draggable={false} />
              </button>
            );
          }
          return (
            <button key={i} onClick={() => onChange(i)}
              className="absolute leading-none transition-all duration-300 pointer-events-auto"
              style={{
                top: 0, left: pct(i), transform: "translateX(-50%)", padding: 0,
                color: highlighted ? "#00ff55" : "rgba(200,220,255,0.45)",
                textShadow: highlighted ? "0 0 10px #00ff55, 0 0 20px #00ff33" : "none",
                fontWeight: highlighted ? 600 : 300,
                fontSize: "clamp(15px,3.4cqw,21px)",
              }}
              data-testid={`duration-step-${i}`}>{label}</button>
          );
        });
      })()}

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
  centerIdx, selectedId, onSelect, onCenterChange, engine, activeCategoryId, isPlaying,
}: {
  centerIdx: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCenterChange: (idx: number) => void;
  engine: ReturnType<typeof useAudioEngine>;
  activeCategoryId: string | null;
  isPlaying: boolean;
}) {
  // rotation is React state — used ONLY for tile visibility/opacity calcs.
  // style.transform and style.transition on the cylinder are managed 100%
  // via direct DOM writes so React never touches them and can never cancel
  // a running CSS transition by writing the same value we just set.
  const [rotation,  setRotation]  = useState(centerIdx * ANGLE_STEP);
  const rotRef                    = useRef(centerIdx * ANGLE_STEP);
  const cylinderRef               = useRef<HTMLDivElement>(null);
  const isDragging                = useRef(false);
  const didDrag                   = useRef(false);
  const dragStartX                = useRef<number | null>(null);
  const dragStartRot              = useRef(0);

  const SNAP_EASE = "transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)";

  // Write the cylinder transform without going through React state.
  const setCylinderRot = (deg: number) => {
    if (cylinderRef.current) {
      cylinderRef.current.style.transform = `rotateY(${-deg}deg)`;
    }
  };

  // Set the initial transform on mount (React style prop omits transform
  // entirely so the reconciler never overwrites our direct DOM writes).
  useLayoutEffect(() => { setCylinderRot(rotRef.current); }, []);

  const snapCommitted = (dragDelta: number) => {
    const startSlot = Math.round(dragStartRot.current / ANGLE_STEP);
    const nearest   = Math.round(rotRef.current / ANGLE_STEP);
    // Only commit a directional advance when the user dragged ≥ 20px (= 5.0 deg at DRAG_SENS 0.25).
    // Below that threshold it reads as an accidental wobble during a tap — snap back to current slot.
    const committed =
      dragDelta >  5.0 ? Math.max(nearest, startSlot + 1) :
      dragDelta < -5.0 ? Math.min(nearest, startSlot - 1) :
                         nearest;
    const target    = committed * ANGLE_STEP;
    const newCenter = ((committed % N) + N) % N;
    rotRef.current  = target;
    // Re-enable transition then animate — direct DOM only, React never writes
    // style.transform so it can't cancel this transition mid-flight.
    if (cylinderRef.current) {
      cylinderRef.current.style.transition = SNAP_EASE;
      setCylinderRot(target);
    }
    setRotation(target);   // updates tile visibility/opacity only
    onCenterChange(newCenter);
  };

  const animateTo = (i: number) => {
    const snap      = Math.round(rotRef.current / ANGLE_STEP) * ANGLE_STEP;
    const cur       = ((Math.round(snap / ANGLE_STEP) % N) + N) % N;
    let   steps     = ((i - cur) % N + N) % N;
    if (steps > N / 2) steps -= N;
    const target    = snap + steps * ANGLE_STEP;
    rotRef.current  = target;
    if (cylinderRef.current) {
      cylinderRef.current.style.transition = SNAP_EASE;
      setCylinderRot(target);
    }
    setRotation(target);   // updates tile visibility/opacity only
    onCenterChange(i);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Kill any in-flight CSS transition immediately.
    if (cylinderRef.current) cylinderRef.current.style.transition = "none";
    isDragging.current   = true;
    didDrag.current      = false;
    dragStartX.current   = e.clientX;
    dragStartRot.current = rotRef.current;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || dragStartX.current === null) return;
    const px = e.clientX - dragStartX.current;
    if (Math.abs(px) > 8) didDrag.current = true;
    const r        = dragStartRot.current - px * DRAG_SENS;
    rotRef.current = r;
    // Direct DOM write — no React re-render, buttery smooth at 60/120fps.
    setCylinderRot(r);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const pxDelta = dragStartX.current !== null ? dragStartX.current - e.clientX : 0;
    dragStartX.current = null;
    snapCommitted(pxDelta * DRAG_SENS);
  };

  const thumbSize = "clamp(68px, min(19cqw, 12svh), 92px)";

  return (
    <div className="relative w-full touch-none"
      style={{
        height: "clamp(88px, min(28cqw, 18svh), 160px)",
        perspective: "820px",
        perspectiveOrigin: "50% 50%",
        containerType: "inline-size",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}>

      {/* Single cylinder container — rotateY drives all tile positions.
          will-change promotes this layer to the GPU compositor so drag
          transforms are applied off the main thread. */}
      <div ref={cylinderRef} className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          willChange: "transform",
          // transform and transition are intentionally absent from React style —
          // they are managed 100% by direct DOM writes (setCylinderRot / SNAP_EASE)
          // so the reconciler can never cancel a running CSS transition by writing
          // the same transform value we just committed.
        }}>

        {CATEGORIES.map((cat, i) => {
          const itemAngle = i * ANGLE_STEP;
          const visAngle  = shortArc(itemAngle - rotation);
          const absVis    = Math.abs(visAngle);

          if (absVis > 172) return null;

          const isCentered      = absVis < ANGLE_STEP / 2;
          const isSelected      = cat.id === selectedId;
          const hasPlaying      = cat.tracks.some((t) => engine.tracks[t.id]?.isPlaying);
          // Show yellow stroke when this tile's category is the one with the active track,
          // but the user is currently viewing a different category.
          const isActiveFarCat  = cat.id === activeCategoryId && !isCentered && !!activeCategoryId;
          const faceOpacity = tileOpacity(visAngle);
          const frontShadow = isCentered
            ? "0 14px 32px rgba(0,0,0,0.85), 0 3px 10px rgba(0,0,0,0.6)"
            : "none";

          return (
            <div key={cat.id}
              style={{
                position: "absolute", left: "50%", top: "50%",
                transform: `translate(-50%,-50%) rotateY(${itemAngle}deg) translateZ(${CYLINDER_R}px)`,
                width: thumbSize, height: thumbSize,
                transformStyle: "preserve-3d",
                cursor: isCentered ? "default" : "pointer",
              }}
              onClick={() => {
                if (didDrag.current) { didDrag.current = false; return; }
                if (isCentered) onSelect(cat.id);
                else animateTo(i);
              }}>

              {/* Front face — backfaceVisibility intentionally NOT hidden so the
                  image shows (faintly) as tiles swing around to the back. */}
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
                {/* Yellow ring — active track is from this category but user has spun away */}
                {isActiveFarCat && (
                  <div className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{
                      border: "2.5px solid rgba(255,204,0,0.95)",
                      boxShadow: "0 0 16px rgba(255,200,0,0.75), inset 0 0 8px rgba(255,200,0,0.22)",
                      animation: "carouselRingBlink 1s ease-in-out infinite",
                    }} />
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

function TrackList({
  category, engine, selectedTrackId, onSelectTrack,
}: {
  category: SoundCategory;
  engine: ReturnType<typeof useAudioEngine>;
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
}) {
  return (
    <div className="w-full overflow-y-auto thin-scrollbar"
      style={{
        scrollBehavior: "smooth",
        WebkitOverflowScrolling: "touch",
      }}>
      {category.tracks.map((track: SoundTrack, i: number) => {
        const state      = engine.tracks[track.id];
        const isPlaying  = state?.isPlaying ?? false;
        const isLoading  = state?.isLoading ?? false;
        const hasError   = state?.hasError  ?? false;
        const isSelected = track.id === selectedTrackId;

        // Green = actively playing. Yellow = selected but paused / not yet started.
        const showGreen  = isPlaying;
        const showYellow = isSelected && !isPlaying;

        return (
          <button key={track.id}
            onClick={() => onSelectTrack(track.id)}
            className="relative w-full flex items-center py-[9px] text-left overflow-hidden"
            style={{
              paddingLeft: "64px", paddingRight: "clamp(28px,7cqw,40px)",
              background: "transparent",
              animation: `blindDown 0.28s ease both`,
              animationDelay: `${i * 0.07}s`,
            }}
            data-testid={`track-btn-${track.id}`}>

            {/* Highlight bar — left edge pinned to 52px, matching the duration
                slider's paddingLeft so it aligns with the "1" label.
                right ≈ 19% clears the volume-meter column.            */}
            {(showGreen || showYellow) && (
              <div className="absolute pointer-events-none overflow-hidden"
                style={{
                  top: 0, bottom: 0, left: "42px", right: "19%",
                  animation: showYellow ? "trackBlink 1s ease-in-out infinite" : "none",
                }}>
                <img
                  src={img(showGreen ? "TrackHilite-Green.png" : "TrackHilite-Yellow.png")}
                  alt="" className="w-full h-full"
                  style={{ objectFit: "fill" }}
                  draggable={false}
                />
              </div>
            )}

            {/* Track name — "prefix: label" split: prefix → Kallisto Heavy (700), label → Kallisto Light (300) */}
            <span className="relative leading-none" style={{
              fontSize: "clamp(15px,4.0cqw,20px)",
              color: hasError ? "rgba(255,180,0,0.6)" : "rgba(220,240,255,0.92)",
              letterSpacing: "0.03em",
            }}>
              {(() => {
                const sep = track.name.indexOf(': ');
                if (sep === -1) return <span style={{ fontWeight: 700 }}>{track.name}</span>;
                return (
                  <>
                    <span style={{ fontWeight: 900 }}>{track.name.slice(0, sep)} :</span>
                    <span style={{ fontWeight: 300 }}>{track.name.slice(sep + 1)}</span>
                  </>
                );
              })()}
              {hasError && <span style={{ fontSize: "0.8em", opacity: 0.65 }}> — file not found</span>}
            </span>

            {/* Loading spinner — right-aligned while decoding */}
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/60"
                style={{ width: "clamp(14px,3cqw,18px)", height: "clamp(14px,3cqw,18px)" }} />
            )}
            {/* Error icon */}
            {hasError && !isLoading && (
              <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ width: "clamp(14px,3cqw,18px)", height: "clamp(14px,3cqw,18px)", color: "rgba(255,180,0,0.7)" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

// ─── Settings Panel ───────────────────────────────────────────────────────────

const EQ_MODES = [
  { id: "normal",   label: "Normal",   sub: ""           },
  { id: "hf_boost", label: "HF Boost", sub: "crisper"    },
  { id: "hf_cut",   label: "HF Cut",   sub: "duller"     },
  { id: "lf_boost", label: "LF Boost", sub: "warmer"     },
  { id: "lf_cut",   label: "LF Cut",   sub: "thinner"    },
  { id: "custom",   label: "Custom",   sub: "5-band"     },
] as const;
type EqModeId = typeof EQ_MODES[number]["id"];

// Gain values (dB) for each preset: [100Hz, 330Hz, 1kHz, 3.3kHz, 10kHz]
const EQ_PRESETS: Record<string, number[]> = {
  normal:   [ 0,  0, 0,  0,  0],
  hf_boost: [ 0,  0, 0, +3, +6],
  hf_cut:   [ 0,  0, 0, -3, -6],
  lf_boost: [+6, +3, 0,  0,  0],
  lf_cut:   [-6, -3, 0,  0,  0],
};
const EQ_BAND_LABELS = ["100", "330", "1k", "3.3k", "10k"] as const;

// ─── 5-band EQ slider ────────────────────────────────────────────────────────
function EqBandSlider({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const RANGE = 12;

  const compute = (clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct  = 1 - (clientY - rect.top) / rect.height;
    const raw  = Math.max(-RANGE, Math.min(RANGE, (Math.max(0, Math.min(1, pct)) * 2 * RANGE) - RANGE));
    onChange(Math.round(raw));
  };

  const thumbPct = ((value + RANGE) / (2 * RANGE)) * 100;
  const col = value > 0 ? "#00ff55" : value < 0 ? "#ff6b6b" : "rgba(255,255,255,0.5)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "38px" }}>
      {/* dB readout */}
      <div style={{ fontSize: "10px", height: "15px", textAlign: "center", color: col, lineHeight: 1.5 }}>
        {value === 0 ? "0" : value > 0 ? `+${value}` : value}
      </div>
      {/* Vertical track */}
      <div ref={trackRef}
        style={{ width: "6px", height: "80px", background: "rgba(255,255,255,0.1)", borderRadius: "3px",
          position: "relative", cursor: "ns-resize", WebkitTouchCallout: "none", userSelect: "none" }}
        onPointerDown={e => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); compute(e.clientY); }}
        onPointerMove={e => { if (dragging.current) compute(e.clientY); }}
        onPointerUp={() => { dragging.current = false; }}>
        {/* 0 dB hairline */}
        <div style={{ position: "absolute", left: "-4px", right: "-4px", top: "50%", height: "1px", background: "rgba(255,255,255,0.22)" }} />
        {/* Filled segment between centre and thumb */}
        {value !== 0 && (
          <div style={{
            position: "absolute", left: 0, right: 0, borderRadius: "3px",
            background: col,
            ...(value > 0
              ? { bottom: "50%", height: `${thumbPct - 50}%` }
              : { top: "50%",    height: `${50 - thumbPct}%` }),
          }} />
        )}
        {/* Thumb */}
        <div style={{
          position: "absolute", left: "50%", transform: "translate(-50%, 50%)",
          bottom: `${thumbPct}%`,
          width: "14px", height: "6px", borderRadius: "2px",
          background: col,
          boxShadow: value !== 0 ? `0 0 6px ${col}` : "none",
        }} />
      </div>
      {/* Frequency label */}
      <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.42)", marginTop: "5px", letterSpacing: "0.02em" }}>
        {label}
      </div>
    </div>
  );
}

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "how will the earvana app help relieve my tinnitus ringing?",
    a: "the easiest and quickest way to get tinnitus relief is by 'masking', which is to apply an EXTERNAL sound to overshadow (mask) the INTERNAL ringing.\n\ntraditional approaches often use WHITE NOISE, which is a blast of all sound frequencies simultaneously.  while this can be effective in masking internal auditory ringing, the sound of white noise itself is known to increase stress and agitation, and is not particularly pleasant.\n\nthe earvana method replaces your internal ringing with audio that is not only pleasing to the ear, but calming to the mind;  the experience of being outdoors, in nature.\n\nbut these are not just nature recordings.\n\nthe earvana audio suite features rich soundtracks, digitally mastered with an unprecedented spatial realism.  the result is an audio 'experience' that so closely mimics the real thing, your brain will release the same neurotransmitters as if you are - in fact - standing on the coastal rocks as the waves lap beneath you, or at the edge of a mountain spring.  you can almost smell the fresh air.\n\nand it doesn't stop there.\n\nthese earvana soundscapes are selected and tailored for optimum tinnitus masking, with a unique added layer of treated audio targeting the most common tinnitus frequency bands.\n\nin simple terms, all of the earvana soundscapes not only can mask your internal ringing, but they will instantly calm you and nurture you with an audio experience you will want every day." },
  { q: "my ringing is a constant high-pitch squeal. which earvana soundscapes will work best?",
    a: "the short answer: all of them can be effective.\n\nif your tinnitus is in the high-frequency range (the most common), the ocean, rain, streams and winds are a great fit because they naturally carry sound energy at those frequencies.  also the sound of crickets carry specific high frequencies that can be effective.\n\nthe best advice is to go through all the categories and soundscapes and note which ones serve you the best." },
  { q: "what is the diagnostic tool?",
    a: "for your convenience, the on-board frequency-matching engine is a simple and quick way to help pinpoint your specific tinnitus frequency.\n\nthis is not meant to replace a proper diagnosis by a qualified medical professional, but it is provided for your exploration and understanding.\n\nthe diagnostic tool section can be invoked from the bottom control bar.\n\nclicking 'start test' will load the test tone page, where you can preview all possible tinnitus frequencies.  once you've identified the general 'range', then you can click the yellow blinking arrow to expand the list to narrow down your search.  Continue auditioning until you find the one you feel is closest to matching the pitch of your internal ringing.\n\nNOTE: experiment with different tone durations and volumes.  playing shorter bursts can often help to identify the correct pitch frequency.\n\nalso NOTE:  when the correct frequency is played, you may experience a short term/momentary relief of your ringing.  this is a common occurrence, and can be an excellent way to identify your specific frequency.  letting the player continue for a minute or more may extend the relief period." },
  { q: "what is frequency-notching?",
    a: "in some cases, long-term or permanent relief can be achieved with notching therapy.  this is when the patient/user listens to audio content (in headphones/earbuds) where their specific tinnitus frequency band has been notched out.\n\nover time, the brain fills in the missing frequency and the internal ringing can be suppressed.  the recommended duration is: 1-2 hours daily for 2-3 weeks.\n\nin the diagnostic pages, once you pinpoint your tinnitus frequency, you can choose to notch out that frequency.  settings will be remembered, and you can reset at any time by simply going back to the test page and clicking 'reset' next to that frequency.\n\nfurther research is needed and this is not intended to replace professional medical consultation or treatment." },
  { q: "what is frequency-boosting?",
    a: "same as frequency-notching (above), except the pinpointed frequency is added/boosted louder, rather than subtracted/removed.  You may find that boosting can be piercing at higher volumes, so you may have to listen, overall, quieter.\n\nthese are the exact opposite therapies, but both have had positive reports.  frequency notching has been studied more.\n\nReminder: neither of these therapies will be effective unless you listen with headphones or ear buds." },
  { q: "how do I set the timer?",
    a: "Tap the duration bar at the bottom of the screen to select 1–10 hours, or tap the ∞ icon at the far right for continuous playback. A countdown timer appears above the bar while a track is playing." },
  { q: "what are the recommended speakers for earvana audio?",
    a: "the earvana soundscapes sound great on any playback system, but specifically, earbuds/airpods/headphones will provide the most effective experience for tinnitus sufferers.\n\nwhen playing through external speakers, the most immersive realism happens when your stereo speakers can be physically separated; the wider the better.\n\nBEST: in-ear/over-ear (even better with noise cancellation).\n\nGREAT: higher quality full-range external speakers, separated by 3+ feet.\n\nGOOD: laptop speakers\n\nDECENT: any device where the speakers are closer together (i.e., boombox or portable player or smart speaker or built-in phone/tablet speakers)." },
  { q: "will this work over bluetooth wireless?",
    a: "yes.  the earvana soundscapes work in both wired and wireless mode.\n\nconnect your airpods or wireless buds/phones before pressing play.  audio routes automatically through your device's active output.  depending on your device, clicking the speaker icon on the lower left of your screen can give you output options." },
  { q: "earvana is playing but I don't hear any audio.",
    a: "all devices are different, making it a challenge to get audio to the right place.\n\n1) stop the earvana playback, and then start again.\n\n2) make sure the earvana volume slider is up (showing green LEDs).\n\n3) make sure your device's volume is up (i.e., on the side of your device).\n\n4) it's likely that your device's audio output is going to a nearby bluetooth speaker or device.  to change this, stop the earvana playback and manage your output routing through your device's settings pages.  then restart the earvana playback.\n\n5) quit the earvana app and relaunch." },
  { q: "can I play this through my TV system?",
    a: "yes.  the method depends on your device's settings as well as your TV setup.\n\nin general, the following may help:\n\n1) on iOS (iPhone/iPad):  use AirPlay (control center) to stream to an Apple TV or compatible soundbar.\n\n2) on Android:  use Chromecast or bluetooth to your TV's audio system." },
  { q: "How can I cancel my subscription?",
    a: "Go to Settings → your name → Subscriptions on iPhone/iPad, or Google Play → Account → Subscriptions on Android. Find Tinnitus Relief by Earvana and tap Cancel. Access continues through the end of your current billing period." },
  { q: "Will there be new tracks added in the future?",
    a: "Yes — new sound categories and tracks are in production and delivered automatically to all subscribers at no additional charge." },
];

const PRIVACY_POLICY = `Effective: May 2026

Silverman Music Inc. ("we") is committed to protecting your privacy.

DATA WE COLLECT
Tinnitus Relief by Earvana does not collect, transmit, or store any personal information. No account or login is required. All preferences are stored locally on your device only and are never sent to our servers.

SUBSCRIPTIONS
Subscription billing is managed entirely by Apple App Store or Google Play. We do not access your payment information. Please refer to Apple's or Google's privacy policies for details.

ANALYTICS
We do not use third-party analytics or tracking SDKs.

CHILDREN'S PRIVACY
This app does not knowingly collect data from children under 13.

CONTACT
info@earvana.org`;

const TERMS_OF_SERVICE = `Effective: May 2026

By using Tinnitus Relief by Earvana ("the App") you agree to these Terms.

LICENSE
Silverman Music Inc. grants you a personal, non-transferable, non-exclusive license to use the App for personal, non-commercial purposes only.

RESTRICTIONS
You may not: (a) record or redistribute any audio content; (b) reverse-engineer or decompile the App; (c) use the App for commercial purposes without written consent from Silverman Music Inc.

MEDICAL DISCLAIMER
This App is a sound-masking and relaxation aid only. It is not a medical device and makes no claims to diagnose, treat, cure, or prevent any medical condition including tinnitus. Always consult a licensed audiologist or physician for tinnitus-related medical advice.

SUBSCRIPTIONS
Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date.

DISCLAIMER OF WARRANTIES
The App is provided "as is" without warranty of any kind. Silverman Music Inc. is not liable for any direct, indirect, or incidental damages arising from use of the App.

GOVERNING LAW
These Terms are governed by the laws of the State of California, USA.

© 2026 Silverman Music Inc. All rights reserved.`;

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
        <span style={{ color: "#00c8ff", fontFamily: "monospace", fontSize: "15px", width: "12px", flexShrink: 0, lineHeight: 1 }}>
          {isOpen ? "∨" : ">"}
        </span>
        <span style={{ color: "#00c8ff", fontSize: "16px", letterSpacing: "0.06em" }}>
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

function SettingsPanel({ onClose, eqMode, eqBands, onEqChange, onEqBandsChange }: {
  onClose: () => void;
  eqMode: EqModeId;
  eqBands: number[];
  onEqChange: (m: EqModeId, bands: number[]) => void;
  onEqBandsChange: (bands: number[]) => void;
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
          color: xFlash ? "#00ffcc" : "rgba(255,255,255,0.82)", fontSize: "25px",
          textShadow: xFlash ? "0 0 16px #00ffcc, 0 0 36px #00ffaa, 0 0 60px #00ff88" : "0 2px 8px rgba(0,0,0,0.9)",
          transition: "color 0.12s, text-shadow 0.12s",
        }}>✕</button>

      {/* Panel */}
      <div className="relative" style={{ width: "88%", maxWidth: "390px", height: "88svh", maxHeight: "760px" }}>
        <img src={img("settings-pane.png")} alt=""
          className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />

        <div className="absolute overflow-y-auto thin-scrollbar"
          style={{ top: "calc(12% + 15px)", bottom: "15px", left: "5%", right: "5%", paddingLeft: "0", paddingRight: "0" }}>

          {/* AUDIO */}
          <SettingsRow label="audio" isOpen={openSection === "audio"} onToggle={() => toggleSection("audio")}>
            {/* EQ/SOUND — 1 tab indent */}
            <div style={{ paddingLeft: "14px" }}>
              <div style={{ marginBottom: "8px", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)" }}>
                EQ / SOUND:
              </div>
              {/* Presets */}
              <div style={{ paddingLeft: "14px" }}>
                {EQ_MODES.map(m => (
                  <button key={m.id}
                    onClick={() => {
                      const bands = m.id === "custom" ? eqBands : (EQ_PRESETS[m.id] ?? [0,0,0,0,0]);
                      onEqChange(m.id as EqModeId, bands);
                    }}
                    className="block w-full text-left"
                    style={{ padding: "4px 0", background: "none", border: "none", cursor: "pointer" }}>
                    <span style={{ color: eqMode === m.id ? "#00ff55" : "rgba(255,255,255,0.78)", fontSize: "14px", fontWeight: eqMode === m.id ? 700 : 400 }}>
                      {">"}&nbsp;{m.label}
                    </span>
                    {m.sub && <span style={{ color: "rgba(255,255,255,0.32)", fontSize: "12px", marginLeft: "6px" }}>({m.sub})</span>}
                  </button>
                ))}
              </div>
              {/* Custom 5-band EQ sliders — shown when Custom is active */}
              {eqMode === "custom" && (
                <div style={{ marginTop: "14px", paddingLeft: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>custom 5-band</span>
                    <button
                      onClick={() => onEqBandsChange([0, 0, 0, 0, 0])}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0",
                        fontSize: "12px", color: "rgba(0,200,255,0.75)", letterSpacing: "0.05em" }}>
                      reset
                    </button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingRight: "4px" }}>
                    {eqBands.map((gain, i) => (
                      <EqBandSlider
                        key={i}
                        label={EQ_BAND_LABELS[i]}
                        value={gain}
                        onChange={v => {
                          const next = eqBands.map((g, j) => j === i ? v : g);
                          onEqBandsChange(next);
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ marginTop: "10px", fontSize: "11px", color: "rgba(255,255,255,0.28)", textAlign: "center" }}>
                    drag each band · ±12 dB
                  </div>
                </div>
              )}
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
                    color: "rgba(255,255,255,0.78)", fontSize: "14px" }}>
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
                ? <div style={{ color: "#00ff55", fontSize: "15px", padding: "4px 0" }}>Thank you for your feedback! ✓</div>
                : <>
                    <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} rows={4}
                      placeholder="Share your experience with Tinnitus Relief by Earvana…"
                      style={{ width: "100%", background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: "6px", color: "rgba(255,255,255,0.88)", fontSize: "14px",
                        padding: "8px", resize: "none", boxSizing: "border-box" }} />
                    <button onClick={handleReviewSubmit}
                      style={{ marginTop: "8px", padding: "7px 20px", background: "rgba(0,180,90,0.18)",
                        border: "1px solid rgba(0,255,100,0.35)", borderRadius: "6px",
                        color: "#00ee88", fontSize: "14px", cursor: "pointer", letterSpacing: "0.04em" }}>
                      Submit
                    </button>
                  </>
              }
            </div>
          </SettingsRow>

          {/* FAQ */}
          <SettingsRow label="FAQ" isOpen={openSection === "faq"} onToggle={() => toggleSection("faq")}>
            {/* Questions — 1 tab indent; answers — 2 tab indent */}
            <div style={{ paddingLeft: "14px" }}>
              {FAQ_ITEMS.map((item, i) => (
                <div key={i}>
                  <button onClick={() => toggleSub(`faq-${i}`)} className="w-full text-left flex items-start"
                    style={{ gap: "8px", padding: "8px 0", background: "none", border: "none", cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ color: openSub === `faq-${i}` ? "#ffcc00" : "#00c8ff", fontSize: "12px", lineHeight: "18px", flexShrink: 0, transition: "color 0.15s" }}>
                      {openSub === `faq-${i}` ? "∨" : ">"}
                    </span>
                    <span style={{ color: openSub === `faq-${i}` ? "#ffcc00" : "rgba(255,255,255,0.78)", fontSize: "13px", lineHeight: 1.45, textAlign: "left", transition: "color 0.15s" }}>
                      {item.q}
                    </span>
                  </button>
                  {openSub === `faq-${i}` && (
                    <div style={{ padding: "7px 4px 9px 14px", color: "rgba(255,255,255,0.55)", fontSize: "13px", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
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
                    <span style={{ color: "#00c8ff", fontSize: "12px" }}>{openSub === `legal-${doc.key}` ? "∨" : ">"}</span>
                    <span style={{ color: "rgba(255,255,255,0.78)", fontSize: "13px", letterSpacing: "0.06em" }}>{doc.label}</span>
                  </button>
                  {openSub === `legal-${doc.key}` && (
                    <div style={{ padding: "8px 4px 10px 14px", color: "rgba(255,255,255,0.45)", fontSize: "12px", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                      {doc.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SettingsRow>

          {/* ABOUT */}
          <SettingsRow label="about" isOpen={openSection === "about"} onToggle={() => toggleSection("about")}>
            <div style={{ paddingLeft: "14px", paddingTop: "4px", paddingBottom: "8px" }}>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "15px", letterSpacing: "0.04em", marginBottom: "6px" }}>
                earvana: tinnitus relief
              </div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px", letterSpacing: "0.06em", marginBottom: "10px" }}>
                v1.0&nbsp;&nbsp;(build {BUILD_NUMBER})
              </div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px", letterSpacing: "0.04em", marginBottom: "3px" }}>
                composed and produced by:&nbsp;&nbsp;jay oliver
              </div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px", letterSpacing: "0.05em" }}>
                © 2026&nbsp;&nbsp;silverman music inc.
              </div>
            </div>
          </SettingsRow>
          <div style={{ height: "10px" }} />

        </div>
      </div>
    </div>
  );
}

function Home() {
  const engine = useAudioEngine();
  const [durationStep, setDurationStep] = useState<number>(10);
  // Always start on Oceans (index 0) regardless of last session.
  const [centerIdx,   setCenterIdx]   = useState<number>(0);
  const [selectedId,  setSelectedId]  = useState<string | null>(CATEGORIES[0]?.id ?? null);
  const [settingsOpen,  setSettingsOpen]  = useState<boolean>(false);
  const [diagOpen,      setDiagOpen]      = useState<boolean>(false);
  const diagPausedRef = useRef(false);  // true when we auto-paused on diag open

  const openDiag = useCallback(() => {
    const id = engine.lastPlayedId;
    if (id && engine.tracks[id]?.isPlaying) {
      engine.pause(id);
      diagPausedRef.current = true;
    }
    setDiagOpen(true);
  }, [engine]);

  const closeDiag = useCallback(() => {
    setDiagOpen(false);
    if (diagPausedRef.current) {
      diagPausedRef.current = false;
      engine.resume();
    }
  }, [engine]);

  const [sprocketFlash,   setSprocketFlash]   = useState<boolean>(false);
  const [diagFlash,       setDiagFlash]       = useState<boolean>(false);

  const [eqMode,  setEqMode]  = useState<EqModeId>(
    () => (localStorage.getItem("tr_eq_mode") as EqModeId | null) ?? "normal"
  );
  const [eqBands, setEqBands] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("tr_eq_bands");
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length === 5) return arr as number[];
      }
    } catch { /* malformed — fall through */ }
    const mode = (localStorage.getItem("tr_eq_mode") as EqModeId | null) ?? "normal";
    return EQ_PRESETS[mode] ?? [0, 0, 0, 0, 0];
  });
  // selectedTrackId — the track the user has tapped (yellow blink), independent
  // of whether audio is actually playing. Goes green once PLAY is pressed.
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    () => CATEGORIES[0]?.tracks[0]?.id ?? null
  );

  /* ── Timer ───────────────────────────────────────────────────────────────── */
  const LOOP_STEP = DURATION_STEPS.length - 1;
  const [timeRemaining, setTimeRemaining] = useState<number>(
    durationStep < LOOP_STEP ? stepToSeconds(durationStep) : 0,
  );

  /* Tracks whether the 1-min fade-out has already been armed for this countdown cycle */
  const fadeOutStartedRef = useRef(false);

  /* Reset to full duration whenever the user moves the slider */
  const handleDurationChange = useCallback((s: number) => {
    setDurationStep(s);
    if (s < LOOP_STEP) {
      setTimeRemaining(stepToSeconds(s));
      fadeOutStartedRef.current = false;
    }
  }, [LOOP_STEP]);

  const isPlaying      = Object.values(engine.tracks).some((t) => t.isPlaying);
  const playingTrackId = Object.entries(engine.tracks).find(([, s]) => s.isPlaying)?.[0] ?? null;

  // Which category owns the currently active track (playing or paused/selected).
  const activeTrackId    = playingTrackId ?? selectedTrackId;
  const activeCategoryId = activeTrackId
    ? (CATEGORIES.find(c => c.tracks.some(t => t.id === activeTrackId))?.id ?? null)
    : null;

  // Optimistic play-button visual: flips instantly on click so the icon
  // doesn't wait for the audio fade to finish before changing state.
  const [optimisticPlaying, setOptimisticPlaying] = useState<boolean | null>(null);
  useEffect(() => { setOptimisticPlaying(null); }, [isPlaying]);
  const btnPlaying = optimisticPlaying ?? isPlaying;

  // Keep selectedTrackId in sync when a track starts playing externally
  // (e.g. MediaSession lock-screen Play → engine.resume() → playingTrackId changes).
  useEffect(() => {
    if (playingTrackId) setSelectedTrackId(playingTrackId);
  }, [playingTrackId]);

  /* Count down every second regardless of play/pause state (not in loop mode).
     Uses Date.now() so any time spent with the screen locked / tab backgrounded
     is recovered as elapsed seconds when the page becomes visible again. */
  useEffect(() => {
    if (durationStep >= LOOP_STEP) return;
    let lastTick = Date.now();

    const tick = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - lastTick) / 1000);
      if (elapsed < 1) return;
      lastTick += elapsed * 1000;
      setTimeRemaining(prev => Math.max(0, prev - elapsed));
    };

    const id = setInterval(tick, 1000);
    // Catch up when the page becomes visible after being backgrounded / screen locked.
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [durationStep, LOOP_STEP]);

  /* Allow pinch-zoom on settings/diagnostics pages; lock it out on home screen. */
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    if (settingsOpen || diagOpen) {
      meta.content = "width=device-width, initial-scale=1.0, viewport-fit=cover";
    } else {
      meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover";
    }
  }, [settingsOpen, diagOpen]);

  /* React to timeRemaining changes: arm fade-out at ≤5 min, auto-stop at 0. */
  useEffect(() => {
    if (durationStep >= LOOP_STEP) return;
    // Arm the fade-out once when we cross the 1-minute mark (skip if paused).
    if (isPlaying && timeRemaining <= 60 && timeRemaining > 0 && !fadeOutStartedRef.current) {
      fadeOutStartedRef.current = true;
      engine.startFadeOut(60); // fades to silence exactly at 0:00
    }
    if (timeRemaining <= 0) {
      fadeOutStartedRef.current = false;
      if (playingTrackId) engine.pause(playingTrackId);
      engine.cancelFade();
      setTimeRemaining(stepToSeconds(durationStep));
    }
  // engine methods are stable useCallback refs — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, isPlaying]);

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
    const id  = CATEGORIES[idx].id;
    const cat = CATEGORIES[idx];
    setCenterIdx(idx);
    setSelectedId(id);
    // Keep whatever track is selected (playing or paused elsewhere) unchanged.
    // Only fall back to the first track of this category if there is truly no
    // selection at all (e.g. very first launch before anything has been touched).
    setSelectedTrackId(prev => prev ?? cat.tracks[0]?.id ?? null);
    localStorage.setItem("tr_last_category", id);
  };

  // Tap a track name → play it immediately (no yellow-standby step).
  // Tapping the currently-playing track is a no-op; use PLAY to pause.
  // Tapping a different track while playing crossfades straight to that track.
  const handleTrackSelect = useCallback((id: string) => {
    if (id === playingTrackId) return; // tapping the currently-playing track is a no-op
    // Always start playing immediately — whether paused or mid-play (crossfade).
    engine.play(id);
    setSelectedTrackId(id);
  }, [playingTrackId, engine]);

  // PLAY button: start selected track, or pause the currently playing one.
  const handlePlayButton = useCallback(() => {
    if (isPlaying) {
      setOptimisticPlaying(false);
      if (playingTrackId) engine.pause(playingTrackId);
      // selectedTrackId stays → reverts to yellow blink
    } else if (selectedTrackId) {
      setOptimisticPlaying(true);
      engine.play(selectedTrackId);
    }
  }, [isPlaying, playingTrackId, selectedTrackId, engine]);

  const handleSprocketClick = useCallback(() => {
    setSprocketFlash(true);
    setTimeout(() => { setSprocketFlash(false); setSettingsOpen(true); }, 180);
  }, []);

  const handleEqChange = useCallback((mode: EqModeId, bands: number[]) => {
    setEqMode(mode);
    setEqBands(bands);
    localStorage.setItem("tr_eq_mode", mode);
    localStorage.setItem("tr_eq_bands", JSON.stringify(bands));
    engine.setEq(bands);
  }, [engine]);

  const handleEqBandsChange = useCallback((bands: number[]) => {
    setEqBands(bands);
    setEqMode("custom");
    localStorage.setItem("tr_eq_mode", "custom");
    localStorage.setItem("tr_eq_bands", JSON.stringify(bands));
    engine.setEq(bands);
  }, [engine]);

  // Apply saved EQ into the audio engine's pending queue on first mount.
  // The engine reads this when AudioContext is created on first play.
  useEffect(() => {
    engine.setEq(eqBands);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orientation is locked to portrait via "orientation":"portrait" in manifest.json.
  // The JS screen.orientation.lock() API is intentionally omitted — on iOS it can
  // interfere with the compositor and corrupt the layout.


  return (
    <div className="relative flex flex-col w-full overflow-hidden select-none"
      style={{ height: "100%", boxSizing: "border-box", backgroundColor: "#070e0c", paddingTop: "env(safe-area-inset-top)", touchAction: "none", overscrollBehavior: "none" }}>

      {/* Full-screen background — always visible */}
      <img src={img("TR-bg.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover z-0" draggable={false}
        fetchPriority="high" />

      {/* Settings overlay */}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          eqMode={eqMode}
          eqBands={eqBands}
          onEqChange={handleEqChange}
          onEqBandsChange={handleEqBandsChange}
        />
      )}

      {/* Diagnostics overlay — floats above the app */}
      {diagOpen && !settingsOpen && (
        <DiagnosticsPanel
          onClose={closeDiag}
          onNotch={(freq) => engine.setNotch(freq ?? null)}
          currentNotch={engine.notchedFreq}
          onBoost={(freq) => engine.setBoost(freq ?? null)}
          currentBoost={engine.boostedFreq}
        />
      )}


      {!settingsOpen && !diagOpen && (
        <>
          {/* Top Banner */}
          <div className="relative z-10 flex-shrink-0 w-full">
            <img src={img("TopBanner4.png")} alt="tinnitus relief by earvana with AUDIO-MERSIVE technology"
              className="w-full h-auto block" draggable={false} />
          </div>

          {/* Carousel */}
          <div className="relative flex-shrink-0 z-10" style={{ overflow: "visible" }}>
            <div className="pb-1" style={{ paddingLeft: "8px", paddingRight: "8px", marginTop: "clamp(2px,0.8vh,8px)" }}>
              <CylinderCarousel
                centerIdx={centerIdx}
                selectedId={selectedId}
                onSelect={handleSelect}
                onCenterChange={handleCenterChange}
                engine={engine}
                activeCategoryId={activeCategoryId}
                isPlaying={isPlaying}
              />
            </div>
          </div>

          {/* Track list — flex-1 min-h-0 constrains height so TrackList can scroll.
              The gradient overlay at the bottom creates the "peek" effect: the container
              edge naturally clips a partial track, and the fade makes it look intentional. */}
          <div className="relative flex-1 min-h-0 z-10 overflow-hidden flex flex-col justify-center">
            <div className="w-full flex flex-col overflow-hidden"
              style={{ maxHeight: "100%" }}>
              {selectedId && (() => {
                const cat = CATEGORIES.find((c) => c.id === selectedId);
                return cat ? (
                  <TrackList
                    category={cat}
                    engine={engine}
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={handleTrackSelect}
                  />
                ) : null;
              })()}
            </div>
          </div>

          {/* Bottom controls — intentionally NOT relative so CPanl_bar_btm's absolute inset-0
              resolves against only the icon-row's own relative parent, not this outer wrapper.
              iOS WebKit picks the outermost relative ancestor when there are nested ones. */}
          <div className="z-10 flex-shrink-0" style={{ position: "relative" }}>
            {/* Volume meter — floats above this cluster, anchored to its top edge */}
            <VolumeMeter
              volume={engine.masterVolume}
              onChange={engine.setMasterVolume}
              extraStyle={{ bottom: "100%", paddingBottom: 10 }}
            />

            {/* Duration slider — 10px gap above (volume meter) and below (bar) */}
            <div style={{ paddingLeft: "52px", paddingRight: "44px", paddingTop: "10px", paddingBottom: "10px" }}>
              <DurationSlider
                step={durationStep}
                onChange={handleDurationChange}
                timeRemaining={timeRemaining}
                isPlaying={isPlaying}
              />
              <div style={{ textAlign: "center", fontSize: "clamp(9px,2.2cqw,12px)", color: "rgba(255,255,255,0.45)", letterSpacing: "0.07em", marginTop: "-19px" }}>
                duration (hours)
              </div>
            </div>

            {/* Icon row — Diagnostics pinned left, Sprocket pinned right,
                Play+EQ absolutely centred as a pair.
                The bar image sits on a wrapper that also covers the safe-area
                spacer so the graphic fills all the way to the home indicator
                without pushing the icons down. */}
            {/* Bar wrapper extends into the safe area so CPanl_bar_btm.png fills
                all the way to the home indicator. Icons sit above via paddingBottom. */}
            <div className="relative" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <img src={img("CPanl_bar_btm.png")} alt=""
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ objectFit: "fill" }} draggable={false} />
            <div className="relative flex items-center"
              style={{ paddingLeft: "38px", paddingRight: "clamp(12px,3cqw,22px)", minHeight: "clamp(88px,14dvh,110px)", paddingTop: "5px", paddingBottom: "5px" }}>

              {/* Diagnostics pill — icon + "test" label, or active therapy frequency */}
              {(() => {
                const activeFreq = engine.notchedFreq ?? engine.boostedFreq;
                const isOn   = !!activeFreq;
                const useOnCLK = diagFlash || diagOpen || isOn;
                const fmtFreq = (hz: number) =>
                  hz >= 1000 ? `${(hz / 1000).toFixed(1)}k hz` : `${hz} hz`;
                return (
                  <button
                    onClick={() => { setDiagFlash(true); setTimeout(() => { setDiagFlash(false); diagOpen ? closeDiag() : openDiag(); }, 160); }}
                    className="flex-shrink-0"
                    style={{
                      position: "relative",
                      width: "clamp(118px,29.5cqw,162px)",
                      background: "none", border: "none", padding: 0,
                      cursor: "pointer", display: "block",
                    }}
                    data-testid="btn-diagnostics"
                    aria-label="Tinnitus diagnostics"
                  >
                    {/* Graphic fills the button — icon is baked into the left ~40% */}
                    <img
                      src={useOnCLK ? img("hp_diag_button_ON.png") : img("hp_diag_button_norm.png")}
                      alt="Diagnostics"
                      style={{ width: "100%", height: "auto", display: "block" }}
                      draggable={false}
                    />
                    {/* Text overlay in the right ~57% of the graphic */}
                    <div style={{
                      position: "absolute", top: 0, bottom: 0,
                      left: "40%", right: "6%",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      pointerEvents: "none",
                    }}>
                      {isOn && activeFreq !== null ? (
                        <>
                          {/* Wide-flat chevron — 75% reduced from 3× version */}
                          <svg width="clamp(8px,2cqw,11px)" height="clamp(4px,1cqw,6px)"
                            viewBox="0 0 38 14" style={{ display: "block", marginBottom: 4 }}>
                            <polyline points="2,2 19,12 36,2"
                              fill="none" stroke="#ffcc00" strokeWidth="3.2"
                              strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span style={{ fontFamily: "'Kallisto', sans-serif", fontWeight: 700, color: "#ffcc00", fontSize: "clamp(10px,2.4cqw,13px)", letterSpacing: "0.04em", lineHeight: 1.3 }}>
                            {fmtFreq(activeFreq)}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontFamily: "'Kallisto', sans-serif", fontWeight: 700, color: "#ffcc00", fontSize: "clamp(12px,2.9cqw,15px)", letterSpacing: "0.09em" }}>
                          test
                        </span>
                      )}
                    </div>
                  </button>
                );
              })()}

              {/* Play + EQ bars — absolutely centred; EQ slot always present so
                  the pair doesn't shift when bars appear/disappear */}
              <div className="absolute inset-x-0 flex justify-center items-center pointer-events-none"
                style={{ gap: "clamp(6px,1.8cqw,11px)", transform: "translateX(32px)" }}>
                <PlayButton
                  isPlaying={btnPlaying}
                  isStandby={!btnPlaying && !!selectedTrackId}
                  onClick={handlePlayButton}
                />
                {/* Fixed-width EQ slot — bars animate inside it */}
                <div className="flex items-center justify-center flex-shrink-0"
                  style={{ width: "clamp(22px,5.5cqw,30px)" }}>
                  {btnPlaying && <EqBars />}
                </div>
              </div>
              {/* Sprocket — right edge, nudged left for balance */}
              <div className="flex-1" />
              <button onClick={handleSprocketClick}
                className="flex-shrink-0 transition-opacity duration-150 hover:opacity-80"
                style={{ width: "clamp(64px,16cqw,84px)", marginRight: "clamp(14px,3cqw,22px)" }} data-testid="btn-settings">
                <img src={sprocketFlash ? img("Settings_Sprocket(OnCLK).png") : img("Settings_Sprocket.png")}
                  alt="Settings" className="w-full h-auto" draggable={false} />
              </button>
            </div>{/* end icon row */}
            </div>{/* end bar wrapper */}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Play Button ─────────────────────────────────────────────────────────────

// Delays and durations for 4 equalizer bars — staggered so they feel organic
const EQ_BARS = [
  { dur: "0.55s", delay: "0.00s" },
  { dur: "0.80s", delay: "0.18s" },
  { dur: "0.65s", delay: "0.35s" },
  { dur: "0.72s", delay: "0.10s" },
];

function EqBars() {
  return (
    <svg
      width="clamp(18px,4.5cqw,26px)" viewBox="0 0 46 32"
      style={{ overflow: "visible", filter: "drop-shadow(0 0 4px #00ff55)", flexShrink: 0 }}
    >
      {EQ_BARS.map((bar, i) => (
        <rect
          key={i}
          x={i * 12} y={0} width={8} height={32} rx={3}
          fill="#00ff55"
          style={{
            transformOrigin: `${i * 12 + 4}px 32px`,
            animation: `eqBar ${bar.dur} ease-in-out ${bar.delay} infinite`,
          }}
        />
      ))}
    </svg>
  );
}

function PlayButton({
  isPlaying, isStandby, onClick,
}: {
  isPlaying: boolean;
  isStandby: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="pointer-events-auto flex-shrink-0 active:opacity-60"
      style={{ width: "clamp(56px,14cqw,82px)", position: "relative" }}
      data-testid="btn-play-pause"
    >
      {/* Base — always present underneath, sets container size */}
      <img src={img("PLAYbase.png")} alt={isPlaying ? "Stop" : "Play"}
        className="block w-full h-auto" draggable={false} />

      {/* Green overlay — exact same canvas as PLAYbase, no offset needed */}
      {isPlaying && (
        <img src={img("PLAYgreen.png")} alt=""
          className="absolute top-0 left-0 w-full h-auto pointer-events-none"
          draggable={false} />
      )}

      {/* Yellow standby blink — exact same canvas as PLAYbase */}
      {isStandby && (
        <img src={img("PLAYyellow.png")} alt=""
          className="absolute top-0 left-0 w-full h-auto pointer-events-none"
          style={{ animation: "trackBlink 1s ease-in-out infinite" }}
          draggable={false} />
      )}
    </button>
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
