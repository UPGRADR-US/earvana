import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useRef, useCallback } from "react";
import { Play, Pause, Loader2, AlertTriangle } from "lucide-react";

import { CATEGORIES, SoundCategory, SoundTrack } from "./sounds";
import { useAudioEngine } from "./hooks/useAudioEngine";

const queryClient = new QueryClient();

const BASE = import.meta.env.BASE_URL;
const img = (name: string) => `${BASE}${name}`;

// ─── Volume LED Meter ────────────────────────────────────────────────────────

function VolumeMeter({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (v: number) => void;
}) {
  const meterRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const computeVol = useCallback(
    (clientY: number) => {
      if (!meterRef.current) return;
      const rect = meterRef.current.getBoundingClientRect();
      onChange(Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)));
    },
    [onChange]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      computeVol(e.clientY);
    },
    [computeVol]
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => { if (dragging.current) computeVol(e.clientY); },
    [computeVol]
  );
  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div
      className="absolute right-0 flex items-center gap-[6px]"
      style={{ top: 0, bottom: 0, paddingRight: "clamp(8px, 2vw, 16px)" }}
    >
      <div
        className="flex flex-col items-center justify-center gap-[3px] text-white/40"
        style={{ fontSize: "clamp(6px, 1vw, 10px)", fontWeight: 300 }}
      >
        {"VOLUME".split("").map((ch, i) => <span key={i}>{ch}</span>)}
      </div>

      <div
        ref={meterRef}
        className="relative cursor-pointer touch-none"
        style={{ width: "clamp(26px, 3.5vw, 42px)", height: "100%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="vol-meter"
      >
        <img src={img("VolSldrBase.png")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />
        <img
          src={img("VolSldr_LEDS.png")} alt=""
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill", clipPath: `inset(${((1 - volume) * 100).toFixed(1)}% 0 0 0)` }}
          draggable={false}
        />
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

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    computeStep(e.clientX);
  }, [computeStep]);
  const onPointerMove = useCallback((e: React.PointerEvent) => { if (dragging.current) computeStep(e.clientX); }, [computeStep]);
  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  const knobPct = (step / (DURATION_STEPS.length - 1)) * 100;

  return (
    <div className="flex flex-col gap-[5px] w-full" data-testid="duration-slider">
      <div className="flex items-end justify-between w-full px-[1px]">
        {DURATION_STEPS.map((label, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className="leading-none transition-all duration-150"
            style={{
              color: step === i ? "#00ff55" : "rgba(200,220,255,0.45)",
              textShadow: step === i ? "0 0 10px #00ff55, 0 0 20px #00ff33" : "none",
              fontWeight: step === i ? 600 : 300,
              fontSize: label === "♋" ? "clamp(11px, 1.8vw, 16px)" : "clamp(8px, 1.3vw, 12px)",
            }}
            data-testid={`duration-step-${i}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={trackRef}
        className="relative w-full touch-none cursor-pointer"
        style={{ height: "clamp(18px, 3vh, 28px)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img src={img("SliderSlot_Base.png")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{ left: `calc(${knobPct}% - clamp(8px, 1.5vw, 12px))`, width: "clamp(16px, 3vw, 24px)" }}
        >
          <img src={img("SliderKnob.png")} alt="" className="h-full w-auto" draggable={false} />
        </div>
      </div>
    </div>
  );
}

// ─── Track List ──────────────────────────────────────────────────────────────

function TrackList({
  category,
  engine,
}: {
  category: SoundCategory;
  engine: ReturnType<typeof useAudioEngine>;
}) {
  return (
    <div
      className="w-full overflow-y-auto"
      style={{
        maxHeight: "clamp(100px, 22vh, 200px)",
        background: "rgba(0, 20, 50, 0.72)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid rgba(0,180,255,0.15)",
      }}
    >
      {category.tracks.map((track: SoundTrack) => {
        const state = engine.tracks[track.id];
        const isPlaying = state?.isPlaying ?? false;
        const isLoading = state?.isLoading ?? false;
        const hasError = state?.hasError ?? false;

        return (
          <button
            key={track.id}
            onClick={() => isPlaying ? engine.pause(track.id) : engine.play(track.id)}
            className="w-full flex items-center gap-3 px-4 py-3 transition-colors duration-200 text-left"
            style={{
              background: isPlaying ? "rgba(0,255,80,0.07)" : "transparent",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}
            data-testid={`track-btn-${track.id}`}
          >
            {/* Play state indicator */}
            <div
              className="flex-shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: "clamp(26px, 4vw, 34px)",
                height: "clamp(26px, 4vw, 34px)",
                background: isPlaying ? "rgba(0,255,80,0.18)" : "rgba(255,255,255,0.07)",
                border: `1px solid ${isPlaying ? "rgba(0,255,80,0.4)" : "rgba(255,255,255,0.1)"}`,
                boxShadow: isPlaying ? "0 0 10px rgba(0,255,80,0.25)" : "none",
              }}
            >
              {isLoading ? (
                <Loader2 className="animate-spin text-white/60" style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)" }} />
              ) : hasError ? (
                <AlertTriangle style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)", color: "rgba(255,180,0,0.7)" }} />
              ) : isPlaying ? (
                <Pause style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)", color: "#00ff55" }} />
              ) : (
                <Play style={{ width: "clamp(12px,2vw,16px)", height: "clamp(12px,2vw,16px)", color: "rgba(255,255,255,0.5)", marginLeft: "2px" }} />
              )}
            </div>

            {/* Track name */}
            <span
              style={{
                fontSize: "clamp(11px, 1.8vw, 15px)",
                fontWeight: isPlaying ? 500 : 300,
                color: isPlaying ? "#00ff88" : hasError ? "rgba(255,180,0,0.6)" : "rgba(220,240,255,0.8)",
                textShadow: isPlaying ? "0 0 12px rgba(0,255,80,0.4)" : "none",
                letterSpacing: "0.03em",
              }}
            >
              {track.name}
              {hasError && <span style={{ fontSize: "0.8em", opacity: 0.7 }}> — file not found</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Carousel ────────────────────────────────────────────────────────────────

function Carousel({
  selectedId,
  onSelect,
  engine,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  engine: ReturnType<typeof useAudioEngine>;
}) {
  const selectedCategory = CATEGORIES.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="w-full flex flex-col" style={{ paddingRight: "clamp(60px, 10vw, 90px)" }}>
      {/* Scrollable thumbnail row */}
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          padding: "8px 12px 8px 12px",
        }}
      >
        {CATEGORIES.map((cat) => {
          const active = cat.id === selectedId;
          const hasPlaying = cat.tracks.some((t) => engine.tracks[t.id]?.isPlaying);

          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className="flex-shrink-0 relative rounded-xl overflow-hidden transition-all duration-200"
              style={{
                width: "clamp(80px, 18vw, 130px)",
                height: "clamp(80px, 18vw, 130px)",
                border: active
                  ? "2px solid rgba(0,255,100,0.7)"
                  : "2px solid rgba(255,255,255,0.1)",
                boxShadow: active
                  ? "0 0 16px rgba(0,255,80,0.4), 0 0 4px rgba(0,255,80,0.2)"
                  : "0 2px 8px rgba(0,0,0,0.4)",
                transform: active ? "scale(1.05)" : "scale(1)",
              }}
              data-testid={`category-${cat.id}`}
            >
              <img
                src={img(cat.thumbnail)}
                alt={cat.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
              {/* Playing indicator dot */}
              {hasPlaying && (
                <div
                  className="absolute top-2 right-2 rounded-full"
                  style={{
                    width: 8, height: 8,
                    background: "#00ff55",
                    boxShadow: "0 0 6px #00ff55",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Track list — slides in when a category is selected */}
      {selectedCategory && (
        <TrackList category={selectedCategory} engine={engine} />
      )}
    </div>
  );
}

// ─── Home Screen ─────────────────────────────────────────────────────────────

function Home() {
  const engine = useAudioEngine();
  const [durationStep, setDurationStep] = useState<number>(10);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const isPlaying = Object.values(engine.tracks).some((t) => t.isPlaying);

  const handleCategorySelect = (id: string) => {
    setSelectedCategory((prev) => (prev === id ? null : id));
  };

  const handlePlayPause = () => {
    if (isPlaying) engine.stopAll();
  };

  return (
    <div className="relative flex flex-col w-full overflow-hidden select-none" style={{ height: "100dvh" }}>

      {/* Full-screen background */}
      <img src={img("TR-bg.png")} alt="" className="absolute inset-0 w-full h-full object-cover z-0" draggable={false} />

      {/* Top Banner — natural aspect ratio */}
      <div className="relative z-10 flex-shrink-0 w-full">
        <img src={img("TopBanner.png")} alt="tinnitus relief by earvana" className="w-full h-auto block" draggable={false} />
        <div
          className="absolute right-0 bottom-[28%] text-white/60 text-right pr-4"
          style={{ fontSize: "clamp(7px, 1.3vw, 13px)", fontWeight: 300, letterSpacing: "0.08em" }}
        >
          the professional masking solution
        </div>
      </div>

      {/* Middle area — carousel at bottom, volume meter on right */}
      <div className="relative flex-1 z-10 overflow-hidden flex flex-col justify-end">
        <VolumeMeter volume={engine.masterVolume} onChange={engine.setMasterVolume} />
        <Carousel selectedId={selectedCategory} onSelect={handleCategorySelect} engine={engine} />
      </div>

      {/* Bottom control bar */}
      <div className="relative z-10 flex-shrink-0" style={{ height: "clamp(80px, 17vh, 140px)" }}>
        <img src={img("CPanl_bar_btm.png")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />

        <div
          className="relative z-10 flex items-center h-full"
          style={{ padding: "0 clamp(12px, 3vw, 28px)", gap: "clamp(10px, 2.5vw, 24px)" }}
        >
          <button
            onClick={handlePlayPause}
            className="flex-shrink-0 transition-opacity duration-150 active:opacity-60"
            style={{ width: "clamp(48px, 12vw, 80px)" }}
            data-testid="btn-play-pause"
          >
            <img src={isPlaying ? img("PLAY_ON.png") : img("PLAY_standby.png")} alt={isPlaying ? "Stop" : "Play"} className="w-full h-auto" draggable={false} />
          </button>

          <div className="flex-1 flex flex-col justify-center">
            <DurationSlider step={durationStep} onChange={setDurationStep} />
          </div>

          <button
            className="flex-shrink-0 transition-opacity duration-150 active:opacity-60 hover:opacity-80"
            style={{ width: "clamp(36px, 8vw, 56px)" }}
            data-testid="btn-settings"
          >
            <img src={img("Settings_Sprocket.png")} alt="Settings" className="w-full h-auto" draggable={false} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App Shell ───────────────────────────────────────────────────────────────

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
    </Switch>
  );
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
