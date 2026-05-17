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
    <div className="absolute right-0 flex items-center gap-[5px]"
      style={{ top: 0, bottom: 0, paddingRight: "clamp(6px, 1.5vw, 14px)" }}>
      <div className="flex flex-col items-center justify-center gap-[3px] text-white/35"
        style={{ fontSize: "clamp(5px, 0.9vw, 9px)", fontWeight: 300 }}>
        {"VOLUME".split("").map((ch, i) => <span key={i}>{ch}</span>)}
      </div>
      <div ref={meterRef} className="relative cursor-pointer touch-none"
        style={{ width: "clamp(24px, 3.2vw, 40px)", height: "100%" }}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} data-testid="vol-meter">
        <img src={img("VolSldrBase.png")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />
        <img src={img("VolSldr_LEDS.png")} alt="" className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill", clipPath: `inset(${((1 - volume) * 100).toFixed(1)}% 0 0 0)` }} draggable={false} />
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
        <img src={img("SliderSlot_Base.png")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />
        <div className="absolute top-0 h-full pointer-events-none"
          style={{ left: `calc(${knobPct}% - clamp(8px,1.5vw,12px))`, width: "clamp(16px,3vw,24px)" }}>
          <img src={img("SliderKnob.png")} alt="" className="h-full w-auto" draggable={false} />
        </div>
      </div>
    </div>
  );
}

// ─── Coverflow Carousel ───────────────────────────────────────────────────────

function coverflowStyle(offset: number): CSSProperties {
  const abs = Math.abs(offset);
  const sign = Math.sign(offset);

  if (abs > 2) return { display: "none" };

  // Horizontal spread in vw units (works across screen widths)
  const txVw = sign * (abs === 0 ? 0 : abs === 1 ? 18 : 33);

  // Y-axis rotation for the "tilt" — clamped to 65°
  const rotateY = sign * (abs === 0 ? 0 : abs === 1 ? 50 : 68);

  // Z-axis depth — center pops forward, sides recede
  const translateZ = abs === 0 ? 70 : abs === 1 ? -15 : -50;

  // Scale — center is enlarged, edges shrink
  const scale = abs === 0 ? 1.14 : abs === 1 ? 0.82 : 0.66;

  // Opacity — distant items fade
  const opacity = abs === 0 ? 1 : abs === 1 ? 0.88 : 0.65;

  // Shadow — deeper for center
  const shadow = abs === 0
    ? "drop-shadow(0 18px 36px rgba(0,0,0,0.85)) drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
    : abs === 1
      ? "drop-shadow(0 10px 20px rgba(0,0,0,0.7))"
      : "drop-shadow(0 6px 12px rgba(0,0,0,0.5))";

  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) translateX(${txVw}vw) rotateY(${rotateY}deg) translateZ(${translateZ}px) scale(${scale})`,
    opacity,
    zIndex: 10 - abs * 3,
    filter: shadow,
    transition: "transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.4s ease, filter 0.4s ease",
    cursor: abs === 0 ? "default" : "pointer",
    transformOrigin: "center center",
  };
}

function CoverflowCarousel({
  centerIdx,
  selectedId,
  onSelect,
  onCenterChange,
  engine,
}: {
  centerIdx: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCenterChange: (idx: number) => void;
  engine: ReturnType<typeof useAudioEngine>;
}) {
  // Swipe tracking
  const swipeStart = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => { swipeStart.current = e.clientX; };
  const onPointerUp = (e: React.PointerEvent) => {
    if (swipeStart.current === null) return;
    const delta = e.clientX - swipeStart.current;
    if (Math.abs(delta) > 40) {
      const newIdx = Math.max(0, Math.min(CATEGORIES.length - 1, centerIdx + (delta < 0 ? 1 : -1)));
      onCenterChange(newIdx);
    }
    swipeStart.current = null;
  };

  const thumbnailSize = "clamp(90px, 19vw, 148px)";

  return (
    <div
      className="relative w-full touch-none"
      style={{
        height: "clamp(100px, 21vw, 160px)",
        perspective: "900px",
        perspectiveOrigin: "50% 50%",
        transformStyle: "preserve-3d",
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {CATEGORIES.map((cat, i) => {
        const offset = i - centerIdx;
        const isCentered = offset === 0;
        const isSelected = cat.id === selectedId;
        const hasPlaying = cat.tracks.some((t) => engine.tracks[t.id]?.isPlaying);
        const style = coverflowStyle(offset);

        return (
          <div
            key={cat.id}
            style={{ ...style, width: thumbnailSize, height: thumbnailSize }}
            onClick={() => {
              if (!isCentered) {
                onCenterChange(i);
              } else {
                onSelect(cat.id);
              }
            }}
          >
            <div
              className="w-full h-full rounded-xl overflow-hidden relative"
              style={{
                border: isSelected
                  ? "2px solid rgba(0,255,100,0.75)"
                  : isCentered
                    ? "2px solid rgba(255,255,255,0.25)"
                    : "2px solid rgba(255,255,255,0.08)",
                boxShadow: isSelected
                  ? "inset 0 0 0 1px rgba(0,255,80,0.3)"
                  : "none",
              }}
            >
              <img src={img(cat.thumbnail)} alt={cat.name} className="w-full h-full object-cover" draggable={false} />

              {/* Playing indicator */}
              {hasPlaying && (
                <div className="absolute top-[6px] right-[6px] rounded-full"
                  style={{ width: 8, height: 8, background: "#00ff55", boxShadow: "0 0 6px #00ff55" }} />
              )}

              {/* Centered-item hint overlay */}
              {isCentered && !isSelected && (
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1"
                  style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.45))" }}>
                  <span style={{ fontSize: "clamp(8px,1.1vw,10px)", color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em" }}>
                    tap to open
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
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
        const state = engine.tracks[track.id];
        const isPlaying = state?.isPlaying ?? false;
        const isLoading = state?.isLoading ?? false;
        const hasError = state?.hasError ?? false;

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
                : hasError ? <AlertTriangle style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)", color: "rgba(255,180,0,0.7)" }} />
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
  // centerIdx drives the 3D position; selectedId drives the track list
  const [centerIdx, setCenterIdx] = useState<number>(2); // default to middle category
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isPlaying = Object.values(engine.tracks).some((t) => t.isPlaying);

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleCenterChange = (idx: number) => {
    setCenterIdx(idx);
    setSelectedId(null); // collapse track list when carousel moves
  };

  // Right padding to leave room for the volume meter
  const contentPadRight = "clamp(60px, 10vw, 92px)";

  return (
    <div className="relative flex flex-col w-full overflow-hidden select-none" style={{ height: "100dvh" }}>

      {/* Full-screen background */}
      <img src={img("TR-bg.png")} alt="" className="absolute inset-0 w-full h-full object-cover z-0" draggable={false} />

      {/* Top Banner */}
      <div className="relative z-10 flex-shrink-0 w-full">
        <img src={img("TopBanner.png")} alt="tinnitus relief by earvana" className="w-full h-auto block" draggable={false} />
        <div className="absolute right-0 bottom-[28%] text-white/60 text-right pr-4"
          style={{ fontSize: "clamp(7px,1.3vw,13px)", fontWeight: 300, letterSpacing: "0.08em" }}>
          the professional masking solution
        </div>
      </div>

      {/* Middle area */}
      <div className="relative flex-1 z-10 overflow-hidden flex flex-col">

        {/* Volume meter spans entire right side of middle area */}
        <VolumeMeter volume={engine.masterVolume} onChange={engine.setMasterVolume} />

        {/* Carousel — just below the banner */}
        <div className="flex-shrink-0 pt-3 pb-2" style={{ paddingRight: contentPadRight, paddingLeft: "8px" }}>
          <CoverflowCarousel
            centerIdx={centerIdx}
            selectedId={selectedId}
            onSelect={handleSelect}
            onCenterChange={handleCenterChange}
            engine={engine}
          />
        </div>

        {/* Track list — slides in below carousel */}
        {selectedId && (() => {
          const cat = CATEGORIES.find((c) => c.id === selectedId);
          return cat ? (
            <div className="flex-shrink-0" style={{ paddingRight: contentPadRight }}>
              <TrackList category={cat} engine={engine} />
            </div>
          ) : null;
        })()}

        {/* Remaining space — atmospheric background */}
        <div className="flex-1" />
      </div>

      {/* Bottom control bar */}
      <div className="relative z-10 flex-shrink-0" style={{ height: "clamp(80px,17vh,140px)" }}>
        <img src={img("CPanl_bar_btm.png")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />
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
