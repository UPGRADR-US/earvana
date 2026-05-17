import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useRef, useCallback } from "react";

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

// ─── Home Screen ──────────────────────────────────────────────────────────────

function Home() {
  const engine = useAudioEngine();
  const [durationStep, setDurationStep] = useState<number>(10);

  const isPlaying = Object.values(engine.tracks).some((t) => t.isPlaying);

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

      {/* Middle area — atmospheric space + volume meter */}
      <div className="relative flex-1 z-10 overflow-hidden">
        <VolumeMeter volume={engine.masterVolume} onChange={engine.setMasterVolume} />
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
