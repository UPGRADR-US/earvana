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
        style={{ width: "clamp(24px, 3.2cqw, 40px)", height: "clamp(180px, 32vh, 260px)" }}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} data-testid="vol-meter">
        <img src={img("VolSldrBase.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }} draggable={false} />
        <img src={img("VolSldr_LEDS.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill", clipPath: `inset(${((1 - volume) * 100).toFixed(1)}% 0 0 0)` }}
          draggable={false} />
      </div>
      <div className="flex flex-col items-center justify-center gap-[3px]"
        style={{ fontSize: "clamp(7px, 1.3cqw, 11px)", fontWeight: 300, color: "rgba(255,255,255,0.6)", height: "clamp(180px, 32vh, 260px)" }}>
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
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
      style={{ height: "clamp(42px,7vh,50px)", touchAction: "none" }}
      onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU}
      data-testid="duration-slider">

      {/* Timer readout — floats above the bar, horizontally aligned with the knob.
          Hidden in loop mode. Uses same pct(step) formula as knob for perfect alignment. */}
      {step < loopStep && (
        <div className="absolute pointer-events-none"
          style={{
            bottom: "calc(100% + 6px)",
            left: pct(step),
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}>
          <span style={{
            color: isPlaying ? "#00ff55" : "rgba(0,255,85,0.55)",
            fontSize: "clamp(13px,3.2cqw,18px)",
            fontWeight: 700,
            letterSpacing: "0.05em",
            fontVariantNumeric: "tabular-nums",
            textShadow: isPlaying
              ? "0 0 10px #00ff55, 0 0 22px #00ff33"
              : "0 0 6px rgba(0,255,85,0.3)",
            transition: "color 0.3s, text-shadow 0.3s",
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
                width: "clamp(13px,3cqw,18px)", opacity: active ? 1 : 0.45, padding: 0,
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
              fontSize: "clamp(11px,2.4cqw,16px)",
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

      {/* Duration text */}
      <img src={img("durationtext.png")} alt="duration (hours)"
        className="absolute bottom-0 left-0 right-0 w-full pointer-events-none"
        style={{ height: "clamp(9px,1.5vh,13px)", objectFit: "contain", objectPosition: "center" }}
        draggable={false} />
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
  return a < 98 ? 1 : a < 155 ? 1 - ((a - 98) / 57) * 0.6 : 0;
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

          if (absVis > 155) return null;   // in the back — invisible, skip rendering

          const isCentered  = absVis < ANGLE_STEP / 2;
          const isSelected  = cat.id === selectedId;
          const hasPlaying  = cat.tracks.some((t) => engine.tracks[t.id]?.isPlaying);
          const faceOpacity = tileOpacity(visAngle);
          const frontShadow = isCentered
            ? "0 14px 32px rgba(0,0,0,0.85), 0 3px 10px rgba(0,0,0,0.6)"
            : "0 6px 16px rgba(0,0,0,0.7)";

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

              {/* Slab edges */}
              <div style={{ position:"absolute", top:0, right:0, width:SLAB_DEPTH, height:"100%",
                transformOrigin:"right center", transform:"rotateY(90deg)",
                background:EDGE_RIGHT, opacity:faceOpacity, borderRadius:"0 12px 12px 0" }} />
              <div style={{ position:"absolute", top:0, left:0, width:SLAB_DEPTH, height:"100%",
                transformOrigin:"left center", transform:"rotateY(-90deg)",
                background:EDGE_LEFT, opacity:faceOpacity, borderRadius:"12px 0 0 12px" }} />
              <div style={{ position:"absolute", top:0, left:0, width:"100%", height:SLAB_DEPTH,
                transformOrigin:"center top", transform:"rotateX(90deg)",
                background:EDGE_TOP, opacity:faceOpacity, borderRadius:"12px 12px 0 0" }} />
              <div style={{ position:"absolute", bottom:0, left:0, width:"100%", height:SLAB_DEPTH,
                transformOrigin:"center bottom", transform:"rotateX(-90deg)",
                background:EDGE_BOTTOM, opacity:faceOpacity, borderRadius:"0 0 12px 12px" }} />

              {/* Front face — pushed forward by SLAB_DEPTH */}
              <div className="absolute inset-0 rounded-xl overflow-hidden"
                style={{
                  transform: `translateZ(${SLAB_DEPTH}px)`,
                  opacity: faceOpacity,
                  border: isCentered || isSelected
                    ? "2px solid rgba(0,255,100,0.8)"
                    : "2px solid rgba(255,255,255,0.07)",
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
            className="w-full flex items-center gap-3 py-[18px] text-left"
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

function Home() {
  const engine = useAudioEngine();
  const [durationStep, setDurationStep] = useState<number>(10);
  const [centerIdx,   setCenterIdx]   = useState<number>(2);
  const [selectedId,  setSelectedId]  = useState<string | null>(CATEGORIES[2].id);
  const [sprocketActive, setSprocketActive] = useState<boolean>(false);

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

  const handleSelect = (id: string) => setSelectedId(id);
  // When a new tile snaps to centre, immediately show its track list.
  const handleCenterChange = (idx: number) => { setCenterIdx(idx); setSelectedId(CATEGORIES[idx].id); };

  return (
    <div className="relative flex flex-col w-full overflow-hidden select-none"
      style={{ height: "100svh", touchAction: "none", overscrollBehavior: "none" }}>

      {/* Full-screen background */}
      <img src={img("TR-bgV2.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover z-0" draggable={false} />

      {/* Top Banner — RGBA PNG; transparent wave bottom blends into the background naturally */}
      <div className="relative z-10 flex-shrink-0 w-full">
        <img src={img("TopBannerV2.png")} alt="tinnitus relief by earvana"
          className="w-full h-auto block" draggable={false} />
      </div>

      {/* Volume meter — anchored to outer container, sits just above the control bar */}
      <VolumeMeter
        volume={engine.masterVolume}
        onChange={engine.setMasterVolume}
        bottomPad="clamp(66px,12vh,92px)"
      />

      {/* Carousel area — overflow:visible keeps 3D depth rendering intact.
          flex-shrink-0 so it never expands to steal track-list space. */}
      <div className="relative flex-shrink-0 z-10" style={{ overflow: "visible" }}>
        <div className="pb-1" style={{ paddingLeft: "8px", paddingRight: "8px", marginTop: "6px" }}>
          <CylinderCarousel
            centerIdx={centerIdx}
            selectedId={selectedId}
            onSelect={handleSelect}
            onCenterChange={handleCenterChange}
            engine={engine}
          />
        </div>
      </div>

      {/* Track list area — separate flex-1 with overflow:hidden so it never
          pushes the control bar. Scrolls internally however long the list is. */}
      <div className="relative flex-1 min-h-0 z-10 overflow-hidden" style={{ paddingBottom: "10px" }}>
        {selectedId && (() => {
          const cat = CATEGORIES.find((c) => c.id === selectedId);
          return cat ? <TrackList category={cat} engine={engine} /> : null;
        })()}
      </div>

      {/* Bottom control bar */}
      <div className="relative z-10 flex-shrink-0"
        style={{ height: "calc(clamp(62px,11vh,88px) + env(safe-area-inset-bottom, 0px))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <img src={img("CPanl_bar_btm.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }} draggable={false} />
        <div className="relative z-10 flex items-center h-full"
          style={{ padding: "0 clamp(16px,4cqw,28px)", gap: "clamp(6px,1.5cqw,14px)" }}>
          {/* Play / Pause */}
          <button onClick={() => { if (isPlaying && playingTrackId) engine.pause(playingTrackId); else engine.resume(); }}
            className="flex-shrink-0 transition-opacity duration-150 active:opacity-60"
            style={{ width: "clamp(44px,11cqw,72px)" }} data-testid="btn-play-pause">
            <img src={isPlaying ? img("PLAY_ON.png") : img("PLAY_standby.png")}
              alt={isPlaying ? "Stop" : "Play"} className="w-full h-auto" draggable={false} />
          </button>
          {/* Duration slider — margins further narrow the slot */}
          <div className="flex-1 flex flex-col justify-center" style={{ minWidth: 0, margin: "0 clamp(4px,1cqw,8px)" }}>
            <DurationSlider
              step={durationStep}
              onChange={handleDurationChange}
              timeRemaining={timeRemaining}
              isPlaying={isPlaying}
            />
          </div>
          {/* Settings sprocket */}
          <button onClick={() => setSprocketActive(a => !a)}
            className="flex-shrink-0 transition-opacity duration-150 active:opacity-60 hover:opacity-80"
            style={{ width: "clamp(58px,14cqw,84px)" }} data-testid="btn-settings">
            <img src={sprocketActive ? img("Settings_Sprocket(OnCLK).png") : img("Settings_Sprocket.png")}
              alt="Settings" className="w-full h-auto" draggable={false} />
          </button>
        </div>
      </div>
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
