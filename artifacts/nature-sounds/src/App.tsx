import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useRef, useCallback, CSSProperties } from "react";
import { Play, Pause, Loader2, AlertTriangle } from "lucide-react";

import { CATEGORIES, SoundCategory, SoundTrack } from "./sounds";
import { useAudioEngine } from "./hooks/useAudioEngine";

const queryClient = new QueryClient();
const BASE = import.meta.env.BASE_URL;
const img = (name: string) => `${BASE}${name}`;

// ─── Volume LED Meter ────────────────────────────────────────────────────────

function VolumeMeter({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
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
    <div className="absolute right-0 bottom-0 flex items-end gap-[5px]"
      style={{ paddingRight: "clamp(6px, 1.5vw, 14px)", paddingBottom: "clamp(6px, 1vh, 12px)" }}>
      <div className="flex flex-col items-center justify-center gap-[3px] text-white/35"
        style={{ fontSize: "clamp(5px, 0.9vw, 9px)", fontWeight: 300, height: "clamp(180px, 32vh, 260px)" }}>
        {"VOLUME".split("").map((ch, i) => <span key={i}>{ch}</span>)}
      </div>
      <div ref={meterRef} className="relative cursor-pointer touch-none"
        style={{ width: "clamp(24px, 3.2vw, 40px)", height: "clamp(180px, 32vh, 260px)" }}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} data-testid="vol-meter">
        <img src={img("VolSldrBase.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }} draggable={false} />
        <img src={img("VolSldr_LEDS.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill", clipPath: `inset(${((1 - volume) * 100).toFixed(1)}% 0 0 0)` }}
          draggable={false} />
      </div>
    </div>
  );
}

// ─── Duration Slider ─────────────────────────────────────────────────────────

const DURATION_STEPS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "♋"];

function DurationSlider({ step, onChange }: { step: number; onChange: (s: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const computeStep = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const idx = Math.round(((clientX - rect.left) / rect.width) * (DURATION_STEPS.length - 1));
    onChange(Math.max(0, Math.min(DURATION_STEPS.length - 1, idx)));
  }, [onChange]);

  const onPD = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    computeStep(e.clientX);
  }, [computeStep]);
  const onPM = useCallback((e: React.PointerEvent) => { if (dragging.current) computeStep(e.clientX); }, [computeStep]);
  const onPU = useCallback(() => { dragging.current = false; }, []);

  const knobPct = (step / (DURATION_STEPS.length - 1)) * 100;

  return (
    <div className="flex flex-col gap-[5px] w-full" data-testid="duration-slider">
      <div className="flex items-end justify-between w-full px-[1px]">
        {DURATION_STEPS.map((label, i) => (
          <button key={i} onClick={() => onChange(i)} className="leading-none transition-all duration-150"
            style={{
              color: step === i ? "#00ff55" : "rgba(200,220,255,0.45)",
              textShadow: step === i ? "0 0 10px #00ff55, 0 0 20px #00ff33" : "none",
              fontWeight: step === i ? 600 : 300,
              fontSize: label === "♋" ? "clamp(11px,1.8vw,16px)" : "clamp(8px,1.3vw,12px)",
            }}
            data-testid={`duration-step-${i}`}>{label}</button>
        ))}
      </div>
      <div ref={trackRef} className="relative w-full touch-none cursor-pointer"
        style={{ height: "clamp(18px,3vh,28px)" }}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU}>
        <img src={img("SliderSlot_Base.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }} draggable={false} />
        <div className="absolute top-0 h-full pointer-events-none"
          style={{ left: `calc(${knobPct}% - clamp(8px,1.5vw,12px))`, width: "clamp(16px,3vw,24px)" }}>
          <img src={img("SliderKnob.png")} alt="" className="h-full w-auto" draggable={false} />
        </div>
      </div>
    </div>
  );
}

// ─── Cylinder Carousel ────────────────────────────────────────────────────────
//
// True 3D cylinder: each item sits on a circle via rotateY(angle) + translateZ(R).
// With preserve-3d + perspective the browser handles all depth sorting automatically.
// With N=11 items at 32.7° apart the front arc shows ~5 readable items and items ≥±5
// steps (≥163°) appear as nearly edge-on slivers — the "wraps all the way around" look.

const N = CATEGORIES.length;           // 11
const ANGLE_STEP = 360 / N;            // ~32.7° between slots
const CYLINDER_R = 230;                // px — larger radius keeps 11 items from crowding

function cylinderItemStyle(normalOffset: number): CSSProperties {
  const angle    = normalOffset * ANGLE_STEP;          // degrees
  const absAngle = Math.abs(angle);

  // Shadow deepens as items recede to the back
  const shadow = absAngle < 20
    ? "drop-shadow(0 14px 28px rgba(0,0,0,0.8)) drop-shadow(0 3px 8px rgba(0,0,0,0.5))"
    : absAngle < 90
      ? "drop-shadow(0 8px 18px rgba(0,0,0,0.7))"
      : "drop-shadow(0 4px 10px rgba(0,0,0,0.55))";

  // Stay fully opaque through the first ~3 slots (≈98°), then fade toward the back
  const opacity = absAngle < 98 ? 1 : absAngle < 163 ? 1 - ((absAngle - 98) / 65) * 0.65 : 0.25;

  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    // Core cylinder transform: rotate around the Y axis then push outward by the radius.
    // No manual translateX needed — the geometry handles positioning.
    transform: `translate(-50%, -50%) rotateY(${angle}deg) translateZ(${CYLINDER_R}px)`,
    opacity,
    filter: shadow,
    transition: "transform 0.48s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.48s ease",
    cursor: absAngle < 15 ? "default" : "pointer",
    backfaceVisibility: "visible",
  };
}

// How many degrees the cylinder rotates per pixel dragged.
// ~0.38 deg/px means a full 360° spin takes about 950px of drag travel.
const DRAG_SENSITIVITY = 0.38;

function CylinderCarousel({
  centerIdx, selectedId, onSelect, onCenterChange, engine,
}: {
  centerIdx: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCenterChange: (idx: number) => void;
  engine: ReturnType<typeof useAudioEngine>;
}) {
  // dragAngle: live rotation offset (degrees) applied to the whole cylinder while dragging
  const [dragAngle, setDragAngle]   = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    setIsDragging(true);
    // Capture pointer so we still get move/up events if the finger leaves the element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const delta = e.clientX - dragStartX.current;
    setDragAngle(delta * DRAG_SENSITIVITY);
  };

  const commit = (currentDragAngle: number) => {
    // Round to nearest slot and update centerIdx
    const steps  = Math.round(currentDragAngle / ANGLE_STEP);
    const newIdx = ((centerIdx - steps) % N + N) % N;
    onCenterChange(newIdx);
    setDragAngle(0);
    setIsDragging(false);
    dragStartX.current = null;
  };

  const onPointerUp     = (e: React.PointerEvent) => commit(dragAngle);
  const onPointerCancel = ()                       => commit(0);

  const thumbSize = "clamp(88px, 18vw, 142px)";

  return (
    // Outer div: perspective host + pointer event surface
    <div className="relative w-full touch-none"
      style={{ height: "clamp(150px, 32vw, 230px)", perspective: "820px", perspectiveOrigin: "50% 50%" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}>

      {/* Inner div: the 3D space.
          The cylinder is rotated as a whole via -dragAngle so it tracks the finger
          directly with zero latency. On release we snap to the nearest slot. */}
      <div className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateY(${-dragAngle}deg)`,
          // No transition while the finger is down — follow directly.
          // After release, spring back / snap with a short ease.
          transition: isDragging ? "none" : "transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}>
        {CATEGORIES.map((cat, i) => {
          // Compute the shortest angular path from center to this item
          let offset = i - centerIdx;
          if (offset >  N / 2) offset -= N;
          if (offset < -N / 2) offset += N;

          const isCentered = offset === 0;
          const isSelected = cat.id === selectedId;
          const hasPlaying = cat.tracks.some((t) => engine.tracks[t.id]?.isPlaying);
          const itemStyle  = cylinderItemStyle(offset);

          return (
            <div key={cat.id} style={{ ...itemStyle, width: thumbSize, height: thumbSize }}
              onClick={() => {
                // Only fire a tap if the user didn't drag
                if (Math.abs(dragAngle) < 4) {
                  isCentered ? onSelect(cat.id) : onCenterChange(i);
                }
              }}>
              <div className="w-full h-full rounded-xl overflow-hidden relative"
                style={{
                  border: isSelected
                    ? "2px solid rgba(0,255,100,0.8)"
                    : isCentered
                      ? "2px solid rgba(255,255,255,0.25)"
                      : "2px solid rgba(255,255,255,0.06)",
                  boxShadow: isSelected ? "inset 0 0 0 1px rgba(0,255,80,0.25)" : "none",
                }}>
                <img src={img(cat.thumbnail)} alt={cat.name}
                  className="w-full h-full object-cover" draggable={false} />
                {hasPlaying && (
                  <div className="absolute top-[6px] right-[6px] rounded-full"
                    style={{ width: 8, height: 8, background: "#00ff55", boxShadow: "0 0 6px #00ff55" }} />
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
    <div className="w-full overflow-y-auto"
      style={{
        maxHeight: "clamp(90px, 20vh, 180px)",
        background: "rgba(0, 18, 45, 0.78)",
        backdropFilter: "blur(10px)",
        borderTop: "1px solid rgba(0,180,255,0.12)",
        borderBottom: "1px solid rgba(0,180,255,0.08)",
      }}>
      {category.tracks.map((track: SoundTrack) => {
        const state     = engine.tracks[track.id];
        const isPlaying = state?.isPlaying ?? false;
        const isLoading = state?.isLoading ?? false;
        const hasError  = state?.hasError  ?? false;

        return (
          <button key={track.id}
            onClick={() => isPlaying ? engine.pause(track.id) : engine.play(track.id)}
            className="w-full flex items-center gap-3 px-4 py-[10px] transition-colors duration-200 text-left"
            style={{
              background: isPlaying ? "rgba(0,255,80,0.07)" : "transparent",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
            data-testid={`track-btn-${track.id}`}>
            <div className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200"
              style={{
                width: "clamp(26px,4vw,34px)", height: "clamp(26px,4vw,34px)",
                background: isPlaying ? "rgba(0,255,80,0.18)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${isPlaying ? "rgba(0,255,80,0.4)" : "rgba(255,255,255,0.1)"}`,
                boxShadow: isPlaying ? "0 0 10px rgba(0,255,80,0.3)" : "none",
              }}>
              {isLoading ? <Loader2 className="animate-spin text-white/60" style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)" }} />
                : hasError  ? <AlertTriangle style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)", color: "rgba(255,180,0,0.7)" }} />
                : isPlaying ? <Pause style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)", color: "#00ff55" }} />
                : <Play style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)", color: "rgba(255,255,255,0.5)", marginLeft: "2px" }} />}
            </div>
            <span style={{
              fontSize: "clamp(11px,1.8vw,15px)", fontWeight: isPlaying ? 500 : 300,
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
  const [selectedId,  setSelectedId]  = useState<string | null>(null);

  const isPlaying = Object.values(engine.tracks).some((t) => t.isPlaying);

  const handleSelect = (id: string) => setSelectedId((prev) => (prev === id ? null : id));
  const handleCenterChange = (idx: number) => { setCenterIdx(idx); setSelectedId(null); };

  return (
    <div className="relative flex flex-col w-full overflow-hidden select-none" style={{ height: "100dvh" }}>

      {/* Full-screen background */}
      <img src={img("TR-bg.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover z-0" draggable={false} />

      {/* Top Banner — RGBA PNG; transparent wave bottom blends into the background naturally */}
      <div className="relative z-10 flex-shrink-0 w-full">
        <img src={img("TopBannerV2.png")} alt="tinnitus relief by earvana"
          className="w-full h-auto block" draggable={false} />
      </div>

      {/* Middle area — overflow:visible so the cylinder's depth axis can breathe */}
      <div className="relative flex-1 z-10 flex flex-col" style={{ overflow: "visible" }}>

        {/* Volume meter — anchored bottom-right */}
        <VolumeMeter volume={engine.masterVolume} onChange={engine.setMasterVolume} />

        {/* Cylinder carousel — tight up against the banner */}
        <div className="flex-shrink-0 pt-0 pb-1" style={{ paddingLeft: "8px", paddingRight: "8px" }}>
          <CylinderCarousel
            centerIdx={centerIdx}
            selectedId={selectedId}
            onSelect={handleSelect}
            onCenterChange={handleCenterChange}
            engine={engine}
          />
        </div>

        {/* Track list — opens below carousel when a category is selected */}
        {selectedId && (() => {
          const cat = CATEGORIES.find((c) => c.id === selectedId);
          return cat
            ? <div className="flex-shrink-0">
                <TrackList category={cat} engine={engine} />
              </div>
            : null;
        })()}

        {/* Remaining atmospheric space */}
        <div className="flex-1" />
      </div>

      {/* Bottom control bar */}
      <div className="relative z-10 flex-shrink-0" style={{ height: "clamp(80px,17vh,140px)" }}>
        <img src={img("CPanl_bar_btm.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }} draggable={false} />
        <div className="relative z-10 flex items-center h-full"
          style={{ padding: "0 clamp(12px,3vw,28px)", gap: "clamp(10px,2.5vw,24px)" }}>
          <button onClick={() => { if (isPlaying) engine.stopAll(); }}
            className="flex-shrink-0 transition-opacity duration-150 active:opacity-60"
            style={{ width: "clamp(48px,12vw,80px)" }} data-testid="btn-play-pause">
            <img src={isPlaying ? img("PLAY_ON.png") : img("PLAY_standby.png")}
              alt={isPlaying ? "Stop" : "Play"} className="w-full h-auto" draggable={false} />
          </button>
          <div className="flex-1 flex flex-col justify-center">
            <DurationSlider step={durationStep} onChange={setDurationStep} />
          </div>
          <button className="flex-shrink-0 transition-opacity duration-150 active:opacity-60 hover:opacity-80"
            style={{ width: "clamp(36px,8vw,56px)" }} data-testid="btn-settings">
            <img src={img("Settings_Sprocket.png")} alt="Settings" className="w-full h-auto" draggable={false} />
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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
