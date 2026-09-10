import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { A, useClock } from "./shared";
import "./earphoria.css";

const detentPosition = (value: number) => value === 11 ? 96.5 : ((value - 1) / 9) * 84;

function formatRemaining(seconds: number) {
  if (seconds < 60) return `:${String(Math.max(0, seconds)).padStart(2, "0")}`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function TimerOverlay({ onClose, isClosing = false, timerCompleted = false, durationStep, timeRemaining, isPlaying, onDurationChange, onAdjust }: { onClose?: () => void; isClosing?: boolean; timerCompleted?: boolean; durationStep: number; timeRemaining: number; isPlaying: boolean; onDurationChange: (step: number) => void; onAdjust: (deltaSeconds: number) => void }) {
  const [activeAdjustment, setActiveAdjustment] = useState<"minus" | "plus" | null>(null);
  const [isReady, setIsReady] = useState(false);
  const adjustmentFlashRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const now = useClock();
  const duration = durationStep + 1;
  const sliderPercent = detentPosition(duration);
  const finiteTimer = durationStep < 10;
  const countdownPosition = Math.max(0, Math.min(durationStep, timeRemaining / 3600 - 1));
  const readoutPosition = (countdownPosition / 9) * 84;
  const finalMinute = isPlaying && timeRemaining > 0 && timeRemaining <= 59;
  const clockParts = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).split(" ");
  const hour = clockParts[0];
  const period = clockParts.at(-1)?.toUpperCase() === "AM" ? "AM" : "PM";
  const flashAdjustment = (direction: "minus" | "plus") => {
    if (adjustmentFlashRef.current !== null) window.clearTimeout(adjustmentFlashRef.current);
    setActiveAdjustment(direction);
    adjustmentFlashRef.current = window.setTimeout(() => {
      setActiveAdjustment(null);
      adjustmentFlashRef.current = null;
    }, 110);
  };
  const triggerAdjustment = (direction: "minus" | "plus", deltaSeconds: number, keyboardClick: boolean) => {
    if (keyboardClick) flashAdjustment(direction);
    onAdjust(deltaSeconds);
  };
  const updateDurationFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const nearestStep = Array.from({ length: 11 }, (_, step) => step).reduce((nearest, step) => {
      const position = detentPosition(step + 1);
      const nearestPosition = detentPosition(nearest + 1);
      return Math.abs(pointerPercent - position) < Math.abs(pointerPercent - nearestPosition) ? step : nearest;
    }, 0);
    onDurationChange(nearestStep);
  };
  const handleSliderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDurationFromPointer(event);
  };
  const handleSliderPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateDurationFromPointer(event);
  };
  const handleSliderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextStep = durationStep;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextStep = Math.max(0, durationStep - 1);
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextStep = Math.min(10, durationStep + 1);
    else if (event.key === "Home") nextStep = 0;
    else if (event.key === "End") nextStep = 10;
    else return;
    event.preventDefault();
    onDurationChange(nextStep);
  };
  const requestClose = () => {
    if (!isClosing) onClose?.();
  };
  useEffect(() => () => {
    if (adjustmentFlashRef.current !== null) window.clearTimeout(adjustmentFlashRef.current);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let assemblyDelay = 0;
    const mountedImages = Array.from(panelRef.current?.querySelectorAll("img") ?? []);
    const imageReady = mountedImages.map(image => {
      if (image.complete && image.naturalWidth > 0) {
        return image.decode?.().catch(() => undefined) ?? Promise.resolve();
      }
      return new Promise<void>(resolve => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }).then(() => image.decode?.().catch(() => undefined));
    });
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    Promise.all([...imageReady, fontsReady]).then(() => {
      if (cancelled) return;
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          assemblyDelay = window.setTimeout(() => {
            if (!cancelled) setIsReady(true);
          }, 80);
        });
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(assemblyDelay);
    };
  }, []);
  return <div className={`timer-layer${isReady ? " is-ready" : " is-preparing"}${isClosing ? " is-closing" : ""}`} onClick={requestClose} data-testid="timer-layer"><div className="timer-backdrop"/><div ref={panelRef} className="eh-panel timer-panel" data-testid="timer-overlay" onClick={event => event.stopPropagation()}><div className="timer-assembly"><img className="timer-pane-art" src={`${A}PopupBGpane.png`} alt=""/><button
      className="popup-close-standard"
      style={{
        position: "absolute", top: "2%", left: "4%", zIndex: 10,
        width: 34, height: 34, borderRadius: "50%",
        transform: "translate(-45%, -45%)",
        background: "rgba(10,18,16,0.475)",
        border: "1px solid rgba(0,200,180,0.35)",
        color: "rgba(255,255,255,0.90)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 0, cursor: "pointer", lineHeight: 1,
        fontFamily: "Figtree, sans-serif", fontSize: 17, fontWeight: 700,
        textShadow: "none",
      }}
      onPointerDown={event => { event.stopPropagation(); requestClose(); }}
      onClick={event => { event.stopPropagation(); if (event.detail === 0) requestClose(); }}
      data-testid="button-close-timer"
      aria-label="Close timer"
    >✕</button>
    <div className="timer-time" data-testid="local-time">{hour}<small>{period}</small></div>
    <div className="timer-title">timer</div>
    <div className="duration">
      {finiteTimer && <div className={`duration-readout${finalMinute ? " final-minute" : ""}${timerCompleted ? " timer-completed" : ""}`} style={{left: `${readoutPosition}%`}} data-testid="duration-readout">{formatRemaining(timeRemaining)}</div>}
      <div className="duration-labels">{Array.from({length:10},(_,i)=>{
        const markerIntensity = finiteTimer ? Math.max(0, 1 - Math.abs(i - countdownPosition)) : 0;
        return <button key={i} style={{left: `${detentPosition(i + 1)}%`, "--marker-intensity": markerIntensity} as CSSProperties} onClick={() => onDurationChange(i)} className={markerIntensity > .001 ? "countdown-active" : ""} data-testid={`duration-${i+1}`}>{i+1}</button>;
      })}<button style={{left: `${detentPosition(11)}%`}} onClick={()=>onDurationChange(10)} className={`duration-loop ${duration===11?"seg-active":""}`} data-testid="duration-infinity"><img src={`${A}${duration === 11 ? "LoopIcon-OnCLK.png" : "LoopIcon.png"}`} alt="continuous play"/></button></div>
      <div className="duration-slider" style={{"--slider-fill": `${sliderPercent}%`} as CSSProperties} data-user-duration-step={durationStep} role="slider" tabIndex={0} aria-label="Duration" aria-valuemin={1} aria-valuemax={11} aria-valuenow={duration} aria-valuetext={finiteTimer ? `${duration} hours` : "continuous play"} onPointerDown={handleSliderPointerDown} onPointerMove={handleSliderPointerMove} onKeyDown={handleSliderKeyDown}>
        <img className="duration-slider-base" src={`${A}SliderSlot_Base.png`} alt=""/>
        <img className="duration-slider-meter" src={`${A}SliderSlot_Meter.png`} alt=""/>
        <img className="duration-slider-knob" src={`${A}SliderKnob.png`} alt="" style={{left: `${sliderPercent}%`}}/>
      </div>
      <div className="duration-footer"><img className="duration-text-art" src={`${A}txt-duration.png`} alt="duration in hours"/><img className="continuous-text-art" src={`${A}txt-continuous(${duration === 11 ? "ON" : "OFF"}).png`} alt="continuous play"/></div>
      <div className="timer-adjustments" aria-label="Adjust timer by five minutes">
        <div className="timer-adjustment-buttons">
          <button type="button" className={activeAdjustment === "minus" ? "on-click" : ""} onPointerDown={() => flashAdjustment("minus")} onClick={event => triggerAdjustment("minus", -300, event.detail === 0)} disabled={!finiteTimer} data-testid="timer-minus-five"><span className="timer-adjustment-chevron" aria-hidden="true">‹</span> −5</button>
          <button type="button" className={activeAdjustment === "plus" ? "on-click" : ""} onPointerDown={() => flashAdjustment("plus")} onClick={event => triggerAdjustment("plus", 300, event.detail === 0)} disabled={!finiteTimer} data-testid="timer-plus-five">+5{"\u00a0\u00a0"}<span className="timer-adjustment-chevron" aria-hidden="true">›</span></button>
        </div>
        <span className="timer-adjustment-unit">minutes</span>
      </div>
    </div>
  </div></div></div>;
}
export default TimerOverlay;