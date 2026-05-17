import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useRef, useCallback, useEffect } from "react";

import { useAudioEngine } from "./hooks/useAudioEngine";

const queryClient = new QueryClient();

const BASE = import.meta.env.BASE_URL;
const img = (name: string) => `${BASE}${name}`;

// Duration snap-detents: 1–10 hours + infinite loop
const DURATION_STEPS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "♋"];
const DURATION_COUNT = DURATION_STEPS.length; // 11

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
      const ratio = 1 - (clientY - rect.top) / rect.height;
      onChange(Math.max(0, Math.min(1, ratio)));
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
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      computeVol(e.clientY);
    },
    [computeVol]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const clipTop = (1 - volume) * 100;

  return (
    <div
      className="absolute right-0 flex items-center gap-[6px]"
      style={{ top: "19%", bottom: "16%", paddingRight: "clamp(8px, 2vw, 16px)" }}
    >
      {/* V-O-L-U-M-E label */}
      <div
        className="flex flex-col items-center justify-center gap-[3px] text-white/50"
        style={{ fontSize: "clamp(7px, 1.2vw, 11px)", fontWeight: 300, letterSpacing: "0.05em" }}
      >
        {"VOLUME".split("").map((ch, i) => (
          <span key={i}>{ch}</span>
        ))}
      </div>

      {/* LED meter */}
      <div
        ref={meterRef}
        className="relative cursor-pointer touch-none"
        style={{ width: "clamp(28px, 4vw, 44px)", height: "100%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="vol-meter"
      >
        {/* Grey base dots */}
        <img
          src={img("VolSldrBase.png")}
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }}
          draggable={false}
        />
        {/* Colored LEDs, clipped from top based on volume */}
        <img
          src={img("VolSldr_LEDS.png")}
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: "fill",
            clipPath: `inset(${clipTop.toFixed(1)}% 0 0 0)`,
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

function DurationSlider({
  step,
  onChange,
}: {
  step: number;
  onChange: (s: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const computeStep = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const idx = Math.round(ratio * (DURATION_COUNT - 1));
      onChange(Math.max(0, Math.min(DURATION_COUNT - 1, idx)));
    },
    [onChange]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      computeStep(e.clientX);
    },
    [computeStep]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      computeStep(e.clientX);
    },
    [computeStep]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const knobPercent = (step / (DURATION_COUNT - 1)) * 100;

  return (
    <div className="flex flex-col gap-[6px] w-full" data-testid="duration-slider">
      {/* Number labels */}
      <div className="flex items-end justify-between w-full px-[1px]">
        {DURATION_STEPS.map((label, i) => {
          const active = step === i;
          return (
            <button
              key={i}
              onClick={() => onChange(i)}
              className="leading-none transition-all duration-150 cursor-pointer"
              style={{
                color: active ? "#00ff55" : "rgba(200,220,255,0.45)",
                textShadow: active ? "0 0 10px #00ff55, 0 0 20px #00ff33" : "none",
                fontWeight: active ? 600 : 300,
                fontSize:
                  label === "♋"
                    ? "clamp(11px, 1.8vw, 16px)"
                    : "clamp(8px, 1.3vw, 12px)",
                lineHeight: 1,
              }}
              data-testid={`duration-step-${i}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative w-full touch-none cursor-pointer"
        style={{ height: "clamp(18px, 3vh, 28px)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Track background */}
        <img
          src={img("SliderSlot_Base.png")}
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }}
          draggable={false}
        />

        {/* Knob */}
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{
            left: `calc(${knobPercent}% - clamp(8px, 1.5vw, 12px))`,
            width: "clamp(16px, 3vw, 24px)",
          }}
        >
          <img
            src={img("SliderKnob.png")}
            alt=""
            className="h-full w-auto"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

function Home() {
  const engine = useAudioEngine();
  const [durationStep, setDurationStep] = useState<number>(10); // default: ∞

  const isPlaying = Object.values(engine.tracks).some((t) => t.isPlaying);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      engine.stopAll();
    }
    // Play action will be wired up when the carousel is added
  }, [isPlaying, engine]);

  return (
    <div
      className="relative flex flex-col w-full overflow-hidden select-none"
      style={{ height: "100dvh" }}
    >
      {/* Full-screen background — sits behind everything */}
      <img
        src={img("TR-bg.png")}
        alt=""
        className="absolute inset-0 w-full h-full object-cover z-0"
        draggable={false}
      />

      {/* Top Banner — natural aspect ratio, full width */}
      <div className="relative z-10 flex-shrink-0 w-full">
        <img
          src={img("TopBanner.png")}
          alt="tinnitus relief by earvana"
          className="w-full h-auto block"
          draggable={false}
        />
        {/* Tagline overlaid on right side of banner */}
        <div
          className="absolute right-0 bottom-[28%] text-white/60 text-right pr-4"
          style={{
            fontSize: "clamp(7px, 1.3vw, 13px)",
            fontWeight: 300,
            letterSpacing: "0.08em",
          }}
        >
          the professional masking solution
        </div>
      </div>

      {/* Middle area — fills remaining space, contains volume meter */}
      <div className="relative flex-1 z-10 overflow-hidden">
        <VolumeMeter volume={engine.masterVolume} onChange={engine.setMasterVolume} />
      </div>

      {/* Bottom control bar — fixed height */}
      <div
        className="relative z-10 flex-shrink-0"
        style={{ height: "clamp(80px, 17vh, 140px)" }}
      >
        {/* Bar background image */}
        <img
          src={img("CPanl_bar_btm.png")}
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "fill" }}
          draggable={false}
        />

        {/* Controls row */}
        <div
          className="relative z-10 flex items-center h-full"
          style={{ padding: "0 clamp(12px, 3vw, 28px)", gap: "clamp(10px, 2.5vw, 24px)" }}
        >
          {/* Play / Standby button */}
          <button
            onClick={handlePlayPause}
            className="flex-shrink-0 transition-opacity duration-150 active:opacity-60"
            style={{ width: "clamp(48px, 12vw, 80px)" }}
            data-testid="btn-play-pause"
          >
            <img
              src={isPlaying ? img("PLAY_ON.png") : img("PLAY_standby.png")}
              alt={isPlaying ? "Stop" : "Play"}
              className="w-full h-auto"
              draggable={false}
            />
          </button>

          {/* Duration slider — flex-1 fills remaining space */}
          <div className="flex-1 flex flex-col justify-center">
            <DurationSlider step={durationStep} onChange={setDurationStep} />
          </div>

          {/* Settings gear */}
          <button
            className="flex-shrink-0 transition-opacity duration-150 active:opacity-60 hover:opacity-80"
            style={{ width: "clamp(36px, 8vw, 56px)" }}
            data-testid="btn-settings"
          >
            <img
              src={img("Settings_Sprocket.png")}
              alt="Settings"
              className="w-full h-auto"
              draggable={false}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

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
