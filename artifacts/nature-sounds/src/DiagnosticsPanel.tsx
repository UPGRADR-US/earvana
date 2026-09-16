import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import freqTestPane from "@assets/freqtest_emptypane_1784147052188.png";
import { getRecommendedCategoryNames } from "./frequencyRecommendations";
import { Volume } from "./components/earphoria-layout/shared";
import { EarvanaAudio, isNativeAudio } from "./plugins/EarvanaAudio";

const BASE = import.meta.env.BASE_URL;
const img  = (name: string) => `${BASE}${name}`;

// Eagerly decode pane image used by confirm/stat popups
const _PRELOAD_IMGS = [freqTestPane].map(src => {
  const im = new window.Image();
  im.src = src;
  return im;
});

const KALLISTO: React.CSSProperties = { fontFamily: "'Figtree', sans-serif", transform: "scaleY(0.9)", transformOrigin: "center center" };
const WIPE_MS    = 340;
const TONE_MAX_GAIN = 0.120;

// ─── Card background shared between p1 and p2 ─────────────────────────────────

const CARD_BG: React.CSSProperties = {
  position: "absolute", inset: 0,
  borderRadius: 22,
  background: "linear-gradient(180deg, rgba(31,45,41,0.30) 0%, rgba(25,34,32,0.30) 55%, rgba(21,30,28,0.30) 100%)",
  boxShadow: "inset 0 0 0 1.5px rgba(0,165,140,0.38), 0 0 38px rgba(0,130,110,0.55), 0 0 90px rgba(0,100,85,0.28)",
};

// ─── Golden divider line ───────────────────────────────────────────────────────

function GoldenDivider({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ width: "100%", flexShrink: 0, ...style }}>
      <img src={img("yellow_divider.png")} alt="" draggable={false}
        style={{ display: "block", width: "100%", height: "auto" }} />
    </div>
  );
}

// ─── Frequency bands ──────────────────────────────────────────────────────────

const BANDS = [
  { label: "upper-bass",    base:  500, step:  50, count:  5 },
  { label: "lower-mid",     base:  750, step:  50, count:  5 },
  { label: "midrange",      base: 1000, step: 100, count: 10 },
  { label: "upper-mid",     base: 2000, step: 100, count: 10 },
  { label: "bright-mid",    base: 3000, step: 100, count: 10 },
  { label: "lower-treble",  base: 4000, step: 100, count: 10 },
  { label: "mid-treble",    base: 5000, step: 100, count: 10 },
  { label: "upper-treble",  base: 6000, step: 100, count: 10 },
  { label: "high-treble",   base: 7000, step: 100, count: 10 },
  { label: "sizzle-treble", base: 8000, step: 100, count: 10 },
] as const;

type Band = typeof BANDS[number];

function getSubBands(band: Band): number[] {
  return Array.from({ length: band.count }, (_, i) => band.base + i * band.step);
}

function fmtSub(hz: number): string {
  if (hz < 1000) return `${hz} hz`;
  return `${(hz / 1000).toFixed(1)} khz`;
}

function fmtStatus(hz: number): string {
  if (hz < 1000) return `${hz}hz`;
  return `${(hz / 1000).toFixed(1)}khz`;
}

function volToGain(v: number) { return v * TONE_MAX_GAIN; }

// ─── Volume meter ─────────────────────────────────────────────────────────────

function DiagVolMeter({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
  const ref      = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pressed, setPressed] = useState(false);

  const hit = useCallback((clientY: number) => {
    if (!ref.current) return;
    const { top, height } = ref.current.getBoundingClientRect();
    onChange(Math.max(0.05, Math.min(1, 1 - (clientY - top) / height)));
  }, [onChange]);

  const onPD = useCallback((e: React.PointerEvent) => {
    dragging.current = true; setPressed(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); hit(e.clientY);
  }, [hit]);
  const onPM = useCallback((e: React.PointerEvent) => { if (dragging.current) hit(e.clientY); }, [hit]);
  const onPU = useCallback(() => { dragging.current = false; setPressed(false); }, []);

  return (
    <div ref={ref}
      style={{ position: "relative", height: "clamp(120px,20svh,190px)",
               cursor: "pointer", touchAction: "none", userSelect: "none", flexShrink: 0,
               opacity: pressed ? 1 : 0.5, transition: "opacity 0.15s ease" }}
      onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU}>
      <img src={img("VolSldrBase.png")} alt=""
        style={{ display: "block", height: "100%", width: "auto" }} draggable={false} />
      <img src={img("VolSldr_LEDS.png")} alt=""
        style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "auto",
                 clipPath: `inset(${((1 - volume) * 100).toFixed(1)}% 0 0 0)` }}
        draggable={false} />
    </div>
  );
}

// ─── Speaker icon ─────────────────────────────────────────────────────────────

function SpeakerIcon({ active, size = 16 }: { active: boolean; size?: number }) {
  const c = active ? "#00ff55" : "rgba(200,200,200,0.50)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ flexShrink: 0, display: "block" }}>
      <path d="M3 9v6h4l5 5V4L7 9H3z" fill={c} />
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill={c} />
      {active && (
        <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill={c} />
      )}
    </svg>
  );
}

// ─── Chevron svg ──────────────────────────────────────────────────────────────

function Chevron({ color = "#ffcc00", style }: { color?: string; style?: React.CSSProperties }) {
  return (
    <svg width={8} height={10} viewBox="0 0 10 14" style={{ flexShrink: 0, ...style }}>
      <polyline points="2,2 8,7 2,12"
        fill="none" stroke={color} strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Double chevron ───────────────────────────────────────────────────────────

function DblChevron({ color = "#ffcc00" }: { color?: string }) {
  return (
    <svg width={14} height={10} viewBox="0 0 20 14" style={{ flexShrink: 0 }}>
      <polyline points="2,2 8,7 2,12"  fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="10,2 16,7 10,12" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Shared text styles ───────────────────────────────────────────────────────
const LIST_TXT: React.CSSProperties = { ...KALLISTO, letterSpacing: "0.09em" };
const SUB_TXT:  React.CSSProperties = { ...KALLISTO, letterSpacing: "0.11em" };

// ─── BandRow ──────────────────────────────────────────────────────────────────

interface BandRowProps {
  band: Band;
  expandedBand: string | null;
  blinkingBand: string | null;
  playingFreq: number | null;
  activeBandLabel: string | null;
  auditionedFreq: number | null;
  currentNotch: number | null;
  currentBoost: number | null;
  onStopTone: () => void;
  onSetExpandedBand: (v: string | null) => void;
  onBandExpand: (label: string) => void;
  onBandPlay: (band: Band) => void;
  onSubPlay: (sf: number) => void;
  onSelectClick: (sf: number) => void;
  onNotch: (freq: number | null) => void;
  onBoost: (freq: number | null) => void;
}

const BandRow = memo(function BandRow({
  band, expandedBand, blinkingBand, playingFreq, activeBandLabel, auditionedFreq,
  currentNotch, currentBoost,
  onStopTone, onSetExpandedBand, onBandExpand, onBandPlay, onSubPlay, onSelectClick,
  onNotch, onBoost,
}: BandRowProps) {
  const isExpanded  = expandedBand === band.label;
  const isBlinking  = blinkingBand === band.label;
  const isPlaying   = playingFreq === band.base;
  const hasActive   = activeBandLabel === band.label;

  return (
    <div>
      <div style={{
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "flex-start",
        minHeight: 34, paddingLeft: 100, gap: 5,
      }}>

        {/* EXPAND / collapse button — floats in the left padding so band name never shifts */}
        {(isPlaying || isExpanded || isBlinking) && (
          <button
            onClick={() => {
              if (isExpanded) { onStopTone(); onSetExpandedBand(null); }
              else            { onBandExpand(band.label); }
            }}
            style={{
              position: "absolute", left: 6,
              display: "flex", alignItems: "center", gap: 3,
              background: "none", border: "none", cursor: "pointer", padding: 0,
            }}>
            <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(10px,2.5vw,12px)", color: "#ffcc00", letterSpacing: "0.07em", marginRight: 2, visibility: isExpanded ? "hidden" : "visible" }}>EXPAND</span>
            <svg width={8} height={10} viewBox="0 0 10 14" style={{
              flexShrink: 0,
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.375s cubic-bezier(0.5,0,1,1)",
              animation: isBlinking ? "blinkYellow 0.9s ease-in-out infinite" : "none",
            }}>
              <polyline points="2,2 8,7 2,12"
                fill="none" stroke="#ffcc00" strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        <button onClick={() => onBandPlay(band)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <span style={{
            ...LIST_TXT,
            fontSize: "clamp(17px,4.3cqw,20px)",
            fontWeight: (isPlaying || isExpanded || hasActive) ? 700 : 300,
            color: isPlaying ? "#00ff55" : isExpanded ? "#00cc44" : hasActive ? "#c8a832" : "rgba(255,255,255,0.72)",
          }}>{band.label}</span>
        </button>

        {!isExpanded && (
          <button onClick={() => onBandPlay(band)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center",
                     background: "none", border: "none", cursor: "pointer",
                     padding: 0, flexShrink: 0 }}>
            <SpeakerIcon active={isPlaying} size={15} />
          </button>
        )}

      </div>

      <div style={{ display: "grid", gridTemplateRows: isExpanded ? "1fr" : "0fr", transition: "grid-template-rows 0.375s cubic-bezier(0.5,0,1,1)" }}>
      <div style={{ overflow: "hidden", minHeight: 0 }}>
        {getSubBands(band).map(sf => {
          const sfPlaying = playingFreq === sf;
          const sfNotched = currentNotch === sf;
          const sfBoosted = currentBoost === sf;
          const sfActive  = sfNotched || sfBoosted;

          return (
            <div key={sf} style={{
              display: "flex", alignItems: "center", justifyContent: "flex-start", minHeight: 32, gap: 4,
              paddingLeft: 106,
              borderRadius: sfActive ? 5 : 0,
              background: sfActive ? "rgba(184,154,42,0.10)" : "transparent",
            }}>

              <button onClick={() => onSubPlay(sf)}
                style={{ background: "none", border: "none", cursor: "pointer",
                         padding: 0, flexShrink: 0 }}>
                <span style={{
                  ...SUB_TXT,
                  fontSize: "clamp(15.5px,4.0cqw,18px)",
                  fontWeight: sfPlaying ? 700 : 300,
                  color: sfPlaying ? "#00ff55" : sfActive ? "#c8a832" : "rgba(255,255,255,0.65)",
                }}>{fmtSub(sf)}</span>
              </button>

              <button onClick={() => onSubPlay(sf)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center",
                         background: "none", border: "none", cursor: "pointer",
                         padding: 0, flexShrink: 0 }}>
                <SpeakerIcon active={sfPlaying} size={14} />
              </button>

              {auditionedFreq === sf && !sfActive && (
                <button onClick={() => onSelectClick(sf)} data-testid={`select-frequency-${sf}`}
                  style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: 4, flexShrink: 0 }}>
                  <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(10px,2.5vw,12px)", color: "#ffcc00", letterSpacing: "0.07em" }}>SELECT</span>
                  <Chevron color="#ffcc00" />
                </button>
              )}
              {sfActive && (
                <button onClick={() => { sfNotched ? onNotch(null) : onBoost(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: 8, flexShrink: 0 }}>
                  <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(12px,3.0vw,14px)", color: "#b89a2a", letterSpacing: "0.04em", animation: "blinkYellow 0.9s ease-in-out infinite" }}>RESET</span>
                  <Chevron color="#b89a2a" style={{ animation: "blinkYellow 0.9s ease-in-out infinite" }} />
                </button>
              )}

            </div>
          );
        })}
      </div>
      </div>

    </div>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onClose:      () => void;
  onStartTest?: () => void;
  showInstructionsInitially: boolean;
  selectedFrequency: number | null;
  onSelectedFrequencyChange: (freq: number | null) => void;
  onResetRingMatch: () => void;
  onNotch:      (freq: number | null) => void;
  currentNotch: number | null;
  onBoost:      (freq: number | null) => void;
  currentBoost: number | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiagnosticsPanel({
  onClose, onStartTest, showInstructionsInitially, selectedFrequency, onSelectedFrequencyChange, onResetRingMatch,
  onNotch, currentNotch, onBoost, currentBoost,
}: Props) {
  const initialSelectedFrequency = selectedFrequency ?? currentNotch ?? currentBoost;

  // First open after launch starts with instructions. Any selected frequency
  // starts on Status, regardless of whether notching is active.
  const [page, setPage] = useState<1 | 2 | "confirm" | "confirm2" | "stat">(() =>
    initialSelectedFrequency !== null ? "stat" : showInstructionsInitially ? 1 : 2
  );
  // the frequency anchored in the stat window (persists across mode changes)
  const [statFreq,       setStatFreq]       = useState<number | null>(initialSelectedFrequency);
  const [playingFreq,    setPlayingFreq]     = useState<number | null>(null);
  const [auditionedFreq, setAuditionedFreq]  = useState<number | null>(null);
  const [expandedBand,   setExpandedBand]   = useState<string | null>(null);
  const [toneVolume,     setToneVolume]     = useState(0.20);
  const [startPressed,   setStartPressed]   = useState(false);
  const [p2Anchored,     setP2Anchored]     = useState(false);
  const [blinkingBand,   setBlinkingBand]   = useState<string | null>(null);
  const [statDismissing, setStatDismissing] = useState(false);
  const [instructionsFromStatus, setInstructionsFromStatus] = useState(false);
  // Caution overlay: shows once when entering page 2 via START TEST
  const [showCaution,    setShowCaution]    = useState(false);

  const activeBandLabel = useMemo(() => {
    const active = currentNotch ?? currentBoost;
    if (!active) return null;
    return BANDS.find(b => getSubBands(b).includes(active))?.label ?? null;
  }, [currentNotch, currentBoost]);
  const recommendedCategories = useMemo(() => getRecommendedCategoryNames(statFreq), [statFreq]);

  // When p2 is shown with an active notch/boost, auto-expand + blink that band
  useEffect(() => {
    if (page === 2 && activeBandLabel) {
      setExpandedBand(activeBandLabel);
      setBlinkingBand(activeBandLabel);
    }
  }, [page, activeBandLabel]);

  // ── Tone engine ─────────────────────────────────────────────────────────────

  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gRef   = useRef<GainNode | null>(null);

  const killOsc = useCallback(() => {
    if (isNativeAudio) {
      EarvanaAudio.stopTestTone().catch(() => {});
      return;
    }
    if (oscRef.current) { try { oscRef.current.stop(); } catch { /**/ } oscRef.current.disconnect(); oscRef.current = null; }
    if (gRef.current)   { try { gRef.current.disconnect(); } catch { /**/ } gRef.current = null; }
  }, []);

  const playTone = useCallback((freq: number, gain: number) => {
    killOsc();
    if (isNativeAudio) {
      EarvanaAudio.playTestTone({ freq, gain }).catch((e) =>
        console.error("[Diag] native test tone failed", e),
      );
      setPlayingFreq(freq);
      return;
    }
    if (!ctxRef.current) {
      const Ctx = ((window as unknown) as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? window.AudioContext;
      ctxRef.current = new Ctx();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = freq; g.gain.value = gain;
    osc.connect(g); g.connect(ctx.destination); osc.start();
    oscRef.current = osc; gRef.current = g;
    setPlayingFreq(freq);
  }, [killOsc]);

  const stopTone = useCallback(() => { killOsc(); setPlayingFreq(null); }, [killOsc]);

  useEffect(() => {
    const gain = volToGain(toneVolume);
    if (isNativeAudio) {
      if (playingFreq !== null) EarvanaAudio.setTestToneGain({ gain }).catch(() => {});
      return;
    }
    if (gRef.current) gRef.current.gain.value = gain;
  }, [toneVolume, playingFreq]);
  useEffect(() => () => { killOsc(); ctxRef.current?.close().catch(() => {}); }, [killOsc]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBandPlay = useCallback((band: Band) => {
    setExpandedBand(prev => (prev !== null && prev !== band.label) ? null : prev);
    setBlinkingBand(null);
    if (playingFreq === band.base) stopTone();
    else {
      setAuditionedFreq(band.base);
      playTone(band.base, volToGain(toneVolume));
    }
  }, [playingFreq, playTone, stopTone, toneVolume]);

  const handleBandExpand = useCallback((label: string) => {
    setExpandedBand(prev => prev === label ? null : label);
    setBlinkingBand(label);
    setP2Anchored(true);
  }, []);

  const handleSubPlay = useCallback((sf: number) => {
    if (playingFreq === sf) stopTone();
    else {
      setAuditionedFreq(sf);
      playTone(sf, volToGain(toneVolume));
    }
  }, [playingFreq, playTone, stopTone, toneVolume]);

  // SELECT: remember the frequency immediately; notching remains optional.
  const handleSelectClick = (freq: number) => {
    stopTone();
    setStatFreq(freq);
    onSelectedFrequencyChange(freq);
    setStatDismissing(false);
    setPage("confirm");
  };

  // Stat window: live mode change
  const handleModeChange = (mode: "normal" | "notch" | "boost") => {
    const freq = statFreq;
    if (freq === null) return;
    if (mode === "normal") { onNotch(null); onBoost(null); }
    else if (mode === "notch") { onNotch(freq); onBoost(null); setPage("confirm2"); }
    else { onBoost(freq); onNotch(null); }
  };

  // "repeat test >>" → go back to p2
  const handleRepeatTest = () => {
    setStatDismissing(true);
    setTimeout(() => {
      setStatDismissing(false);
      stopTone(); setPage(2); setP2Anchored(false); setBlinkingBand(null);
    }, 200);
  };

  // "reset >>" → restore a true first-launch RingMatch state
  const handleReset = () => {
    if (statDismissing) return;
    setStatDismissing(true);
    window.setTimeout(() => {
      onNotch(null); onBoost(null);
      setStatFreq(null);
      stopTone();
      onResetRingMatch();
      onClose();
    }, 200);
  };

  const handleShowInstructions = () => {
    stopTone();
    setInstructionsFromStatus(true);
    setPage(1);
    setExpandedBand(null);
    setP2Anchored(false);
    setBlinkingBand(null);
    window.setTimeout(() => setInstructionsFromStatus(false), WIPE_MS);
  };

  const handleSetExpandedBand = useCallback((label: string | null) => {
    setExpandedBand(label);
    if (label === null) setP2Anchored(false);
  }, []);

  const handleClose = () => { stopTone(); onClose(); };
  const flashClickable = (target: EventTarget | null) => {
    const button = target instanceof Element ? target.closest<HTMLButtonElement>("button:not([aria-label^='Close'])") : null;
    if (!button) return;
    button.classList.add("on-click");
    window.setTimeout(() => button.classList.remove("on-click"), 110);
  };

  // Derive current mode from engine state
  const currentMode: "normal" | "notch" | "boost" =
    currentNotch !== null ? "notch" :
    currentBoost !== null ? "boost" : "normal";

  // Slide positions — stat shows over whatever page is underneath
  // From Status, instructions wait off-canvas on the right so ? brings them
  // in right-to-left. From the selector, page 1 remains parked on the left.
  const p1X    = page === 1 ? "0%" : page === "stat" ? "100%" : "-100%";
  const p2X    = page === 2 ? "0%" : "100%";
  const wipeTx = `transform ${WIPE_MS}ms cubic-bezier(0.25,0.46,0.45,0.94)`;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="ringmatch-click-glow absolute inset-0 z-50" onClick={handleClose}
      onPointerDownCapture={event => flashClickable(event.target)}
      onClickCapture={event => { if (event.detail === 0) flashClickable(event.target); }}>

      <style>{`
        @keyframes diagScaleIn {
          0%   { transform: scale(0.05); opacity: 0; }
          60%  { opacity: 1; }
          85%  { transform: scale(1.03); }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes blinkYellow {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.18; }
        }
        @keyframes statScaleIn {
          0%   { transform: scale(0.05); opacity: 0; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @keyframes statScaleOut {
          0%   { transform: scale(1);    opacity: 1; }
          100% { transform: scale(0.05); opacity: 0; }
        }
        @keyframes cautionIn {
          0%   { transform: scale(0.77); opacity: 0.0; }
          52%  { transform: scale(0.79); opacity: 0.4; }
          100% { transform: scale(1.00); opacity: 1.0; }
        }
        @keyframes instructionsInFromRight {
          0%   { transform: translateX(100%); }
          100% { transform: translateX(0%); }
        }
        .ringmatch-confirm-overlay {
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .ringmatch-confirm-overlay::-webkit-scrollbar {
          display: none;
        }
        .ringmatch-confirm-choice {
          box-sizing: border-box;
          border: 1px solid #ffcc00 !important;
          border-radius: 5px;
          background: rgba(0, 0, 0, 0.05) !important;
          transition: border-width 80ms ease, box-shadow 80ms ease;
        }
        .ringmatch-confirm-choice.on-click,
        .ringmatch-confirm-choice:active {
          border-width: 2px !important;
          box-shadow:
            0 0 8px rgba(255, 204, 0, 0.95),
            0 0 18px rgba(255, 204, 0, 0.72),
            inset 0 0 10px rgba(255, 204, 0, 0.32);
        }
        @media (max-height: 760px) {
          .ringmatch-confirm-overlay {
            align-items: flex-start !important;
            padding-top: max(32px, calc(env(safe-area-inset-top) + 20px)) !important;
            padding-bottom: max(20px, env(safe-area-inset-bottom)) !important;
          }
          .ringmatch-confirm-panel {
            flex: 0 0 auto;
          }
        }
      `}</style>

      {/* Blurred background */}
      <img src={img("homepage_BLUR_1784150009315.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* Shadow + animation wrapper — main panel (p1 / p2) */}
      <div onClick={e => e.stopPropagation()} style={{
        position: "absolute",
        top:    "max(calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 22px), clamp(48px,7.5vh,70px))",
        left:   "max(calc(var(--safe-area-inset-left, env(safe-area-inset-left, 0px)) + 22px), clamp(22px,5cqw,34px))",
        right:  "max(calc(var(--safe-area-inset-right, env(safe-area-inset-right, 0px)) + 22px), clamp(22px,5cqw,34px))",
        bottom: "max(calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 22px), clamp(48px,7vh,70px))",
        filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.78))",
        animation: "diagScaleIn 0.72s cubic-bezier(0.25,0.7,0.4,1) both",
        display: page === "confirm" || page === "confirm2" ? "none" : undefined,
        visibility: page === "stat" ? "hidden" : "visible",
        pointerEvents: page === "stat" ? "none" : "auto",
      }}>

        {/* Standard popup close control — straddles the pane's upper-left corner */}
        <button onClick={handleClose} aria-label="Close" style={{
          position: "absolute", top: 0, left: 0, zIndex: 70,
          width: 34, height: 34, borderRadius: "50%",
          transform: "translate(-45%, -45%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          ...KALLISTO, fontWeight: 700, fontSize: 17, lineHeight: 1,
          color: "rgba(255,255,255,0.90)",
          background: "rgba(10,18,16,0.475)", border: "1px solid rgba(0,200,180,0.35)",
          cursor: "pointer", padding: 0,
          opacity: page === "stat" ? 0 : 1,
          pointerEvents: page === "stat" ? "none" : "auto",
          transition: "opacity 0.2s ease",
        }}>✕</button>

        {/* Carousel container */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: "inset(0 round 22px)" }}>

          {/* ════════════════════════════════════════════════════════════════════
              PAGE 1 — "Find Your Tinnitus Pitch" instructions (code-rendered)
          ════════════════════════════════════════════════════════════════════ */}
          <div
            data-testid="ringmatch-instructions-page"
            aria-hidden={page !== 1}
            inert={page !== 1}
            style={{
            position: "absolute", inset: 0,
            transform: `translateX(${p1X})`,
            transition: wipeTx,
            willChange: "transform",
            pointerEvents: page === 1 ? "auto" : "none",
            animation: page === 1 && instructionsFromStatus
              ? `instructionsInFromRight ${WIPE_MS}ms cubic-bezier(0.25,0.46,0.45,0.94) both`
              : undefined,
          }}>

            {/* Card background */}
            <div style={CARD_BG} />

            {/* Content */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              padding: "clamp(44px,9svh,62px) clamp(22px,5.5cqw,32px) clamp(32px,7svh,50px)",
              overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none",
            }}>

              {/* Header */}
              <div style={{ textAlign: "center", marginBottom: "clamp(14px,3.5svh,22px)", flexShrink: 0 }}>
                <div style={{
                  ...KALLISTO, fontWeight: 400,
                  fontSize: "clamp(10px,2.6cqw,13px)",
                  letterSpacing: "0.22em",
                  color: "#ffcc00",
                  textTransform: "uppercase",
                  marginBottom: 2,
                }}>Find/Match Your</div>
                <div style={{
                  ...KALLISTO, fontWeight: 800,
                  fontSize: "clamp(20px,5.2cqw,26px)",
                  letterSpacing: "0.06em",
                  color: "#ffcc00",
                  textTransform: "uppercase",
                }}>Tinnitus Pitch</div>
              </div>

              {/* Note */}
              <p style={{
                ...KALLISTO, fontWeight: 300, fontStyle: "italic",
                fontSize: "clamp(10px,2.5cqw,12px)",
                color: "rgba(255,255,255,0.62)",
                textAlign: "center",
                lineHeight: 1.5,
                marginBottom: "clamp(16px,3.8svh,24px)",
                flexShrink: 0,
              }}>
                NOTE: this is provided as a self-guided personalization tool—not a hearing test or medical diagnosis.
              </p>

              {/* Numbered steps */}
              <ol style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, display: "flex", flexDirection: "column", gap: "clamp(8px,2svh,13px)" }}>
                {[
                  { n: 1, text: <>Use earbuds or headphones in a quiet space.</> },
                  { n: 2, text: <>Start with <u>very low volume</u> and adjust to match the level of your internal ringing.</> },
                  { n: 3, text: <>Audition each frequency band, clicking the arrow to expand and fine-tune.</> },
                  { n: 4, text: <>Start with short bursts, and notice which one(s) exhibit a change in your internal ringing. When you hit your precise frequency, you may notice a temporary relief.</> },
                  { n: 5, text: <>Once you feel you've matched your ringing frequency, experiment with longer tones, as this may help extend the temporary relief period.</> },
                  { n: 6, text: <>Optional:&nbsp; Click "<strong style={{ color: "#ffcc00", fontWeight: 700 }}>SELECT</strong>" and follow the prompts for a possible long-term&nbsp; solution.<br /><span style={{ color: "#ffcc00", fontStyle: "italic", fontWeight: 300, fontSize: "clamp(9px,2.2cqw,11px)" }}>• (see FAQ) for details.</span></> },
                ].map(({ n, text }) => (
                  <li key={n} style={{ display: "flex", alignItems: "flex-start", gap: "clamp(10px,2.5cqw,14px)" }}>
                    <span style={{
                      ...KALLISTO, fontWeight: 800,
                      fontSize: "clamp(15px,3.8cqw,18px)",
                      color: "rgba(255,255,255,0.92)",
                      lineHeight: 1.35,
                      minWidth: "clamp(16px,4cqw,20px)",
                      flexShrink: 0,
                    }}>{n}.</span>
                    <span style={{
                      ...KALLISTO, fontWeight: 400,
                      fontSize: "clamp(13px,3.2cqw,15px)",
                      color: "rgba(255,255,255,0.85)",
                      lineHeight: 1.55,
                    }}>{text}</span>
                  </li>
                ))}
              </ol>

              {/* START TEST stays in the scroll flow after the instructions. */}
              <button
                onPointerDown={() => setStartPressed(true)}
                onPointerUp={() => setStartPressed(false)}
                onPointerLeave={() => setStartPressed(false)}
                onClick={() => { onStartTest?.(); setPage(2); setTimeout(() => setShowCaution(true), 380); }}
                style={{
                  alignSelf: "center", flexShrink: 0,
                  marginTop: "clamp(14px,3svh,22px)",
                  display: "flex", flexDirection: "row", alignItems: "center", gap: 7,
                  background: "none", border: "none", cursor: "pointer",
                  ...KALLISTO, fontWeight: 700, letterSpacing: "0.12em",
                  color: startPressed ? "#ffe566" : "#ffcc00",
                  textShadow: startPressed
                    ? "0 0 8px rgba(255,200,0,0.9), 0 0 20px rgba(220,160,0,0.6)"
                    : "0 0 8px rgba(220,180,0,0.5)",
                  transition: "color 0.08s, text-shadow 0.08s",
                }}>
                <span style={{ width: 14, flexShrink: 0 }} />
                <span style={{ fontSize: "clamp(13px,3.5vw,16px)" }}>START TEST</span>
                <svg width={14} height={14} viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
                  <polygon points="4,2 4,18 17,10"
                    fill={startPressed ? "#ffe566" : "#ffcc00"}
                    style={{ filter: startPressed ? "drop-shadow(0 0 5px rgba(255,200,0,0.9))" : "drop-shadow(0 0 3px rgba(220,180,0,0.5))" }} />
                </svg>
              </button>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              PAGE 2 — RingMatch™ Tool (code-rendered background + interactive list)
          ════════════════════════════════════════════════════════════════════ */}
          <div
            aria-hidden={page !== 2}
            inert={page !== 2}
            style={{
            position: "absolute", inset: 0,
            transform: `translateX(${p2X})`,
            transition: wipeTx,
            willChange: "transform",
            pointerEvents: page === 2 ? "auto" : "none",
          }}>

            {/* Card background */}
            <div style={CARD_BG} />

            {/* Header area */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              display: "flex", flexDirection: "column", alignItems: "center",
              paddingTop: "clamp(32px,8svh,52px)",
              paddingBottom: 0,
              gap: "clamp(8px,1.8svh,12px)",
            }}>
              {/* Title */}
              <div style={{
                ...KALLISTO, fontWeight: 800,
                fontSize: "clamp(19px,4.8cqw,23px)",
                lineHeight: 0.8,
                color: "#ffcc00",
                letterSpacing: "0.04em",
              }}>
                RingMatch<sup style={{
                  fontSize: "0.46em",
                  fontWeight: 300,
                  verticalAlign: "0.38em",
                  letterSpacing: 0,
                  color: "rgba(255,204,0,0.62)",
                }}>™</sup> Tool
              </div>

              {/* Note */}
              <p style={{
                ...KALLISTO, fontWeight: 300, fontStyle: "italic",
                fontSize: "clamp(9.5px,2.3cqw,11.5px)",
                color: "rgba(255,255,255,0.58)",
                textAlign: "center",
                lineHeight: 1.45,
                margin: "0 clamp(18px,5cqw,28px)",
              }}>
                NOTE: this is provided as a self-guided personalization<br />tool—not a hearing test or medical diagnosis.
              </p>

            </div>

            {/* Top golden divider */}
            <div style={{
              position: "absolute",
              top: "calc(24% + 10px - 3svh)",
              left: "22%", right: "22%",
              pointerEvents: "none",
            }}>
              <GoldenDivider />
            </div>

            {/* Bottom golden divider */}
            <div style={{
              position: "absolute",
              bottom: "calc(17% - 3svh)",
              left: "22%", right: "22%",
              pointerEvents: "none",
            }}>
              <GoldenDivider />
            </div>

            {/* Band list scrollable area — padded so rows clear both dividers */}
            <div style={{
              position: "absolute",
              top: "calc(24% + 10px)", bottom: "17%",
              left: 33, right: 38,
              overflowY: "auto",
              overflowX: "hidden",
              scrollbarWidth: "none",
              display: "flex",
              flexDirection: "column",
              justifyContent: p2Anchored ? "flex-start" : "center",
            }}>
              <div style={{ padding: "clamp(28px,4.5svh,42px) 0" }}>
                {BANDS.map(band => (
                  <BandRow
                    key={band.label}
                    band={band}
                    expandedBand={expandedBand}
                    blinkingBand={blinkingBand}
                    playingFreq={playingFreq}
                    activeBandLabel={activeBandLabel}
                    auditionedFreq={auditionedFreq}
                    currentNotch={currentNotch}
                    currentBoost={currentBoost}
                    onStopTone={stopTone}
                    onSetExpandedBand={handleSetExpandedBand}
                    onBandExpand={handleBandExpand}
                    onBandPlay={handleBandPlay}
                    onSubPlay={handleSubPlay}
                    onSelectClick={handleSelectClick}
                    onNotch={onNotch}
                    onBoost={onBoost}
                  />
                ))}
              </div>
            </div>

            {/* Reuse the home-screen horizontal volume control for tone auditioning. */}
            <Volume
              className="ringmatch-volume"
              value={toneVolume * 100}
              onChange={(value) => setToneVolume(value / 100)}
            />

            {/* ── CAUTION overlay ─────────────────────────────────────────── */}
            {showCaution && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 80,
                display: "flex", alignItems: "flex-end", justifyContent: "center",
                padding: "0 clamp(14px,4cqw,22px) clamp(100px,14svh,125px)",
                pointerEvents: "auto",
              }}>
                <div style={{
                  position: "relative",
                  width: "100%",
                  background: "linear-gradient(160deg, rgba(14,28,24,0.90) 0%, rgba(10,22,18,0.90) 100%)",
                  borderRadius: 14,
                  border: "1.5px solid rgba(0,160,130,0.35)",
                  boxShadow: "0 8px 40px rgba(0,0,0,0.82), inset 0 0 0 1px rgba(0,200,160,0.06)",
                  padding: "clamp(18px,4.5svh,26px) clamp(18px,4.5cqw,24px) clamp(14px,3.5svh,20px)",
                  animation: "cautionIn 0.55s cubic-bezier(0.95,0,1,1) both",
                  display: "flex", flexDirection: "column",
                }}>

                  {/* CAUTION heading */}
                  <div style={{
                    ...KALLISTO, fontWeight: 800,
                    fontSize: "clamp(17px,4.2cqw,20px)",
                    color: "#ffcc00",
                    textAlign: "center",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}>CAUTION:</div>

                  {/* Sub-heading */}
                  <div style={{
                    ...KALLISTO, fontWeight: 500,
                    fontSize: "clamp(14px,3.5cqw,16px)",
                    color: "#4adf5a",
                    textAlign: "center",
                    marginBottom: "clamp(10px,2.5svh,14px)",
                  }}>If you have sensitive ears,</div>

                  {/* LOW volume line */}
                  <div style={{
                    ...KALLISTO, fontWeight: 400,
                    fontSize: "clamp(13px,3.2cqw,15px)",
                    color: "rgba(255,255,255,0.9)",
                    textAlign: "center",
                    marginBottom: "clamp(8px,2svh,12px)",
                  }}>
                    Start with <strong style={{ fontWeight: 800 }}>LOW</strong> volume.
                  </div>

                  {/* Body text — full width so it centres correctly */}
                  <div style={{ position: "relative", marginBottom: "clamp(14px,3.5svh,20px)" }}>
                    <p style={{
                      ...KALLISTO, fontWeight: 400,
                      fontSize: "clamp(12px,3cqw,13.5px)",
                      color: "rgba(255,255,255,0.82)",
                      lineHeight: 1.55,
                      textAlign: "center",
                      margin: 0,
                    }}>
                      Then slowly increase<br />
                      to match the level<br />
                      of your ringing<br />
                      at your comfort level.
                    </p>
                  </div>

                  {/* Got it button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setShowCaution(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        background: "linear-gradient(135deg, rgba(0,60,20,0.97) 0%, rgba(0,90,30,0.93) 100%)",
                        border: "1.5px solid rgba(74,223,90,0.55)",
                        borderRadius: 8,
                        padding: "8px 16px 8px 18px",
                        cursor: "pointer",
                        ...KALLISTO, fontWeight: 600,
                        fontSize: "clamp(13px,3.2cqw,15px)",
                        color: "#4adf5a",
                        letterSpacing: "0.04em",
                        boxShadow: "0 0 12px rgba(74,223,90,0.18)",
                      }}>
                      Got it!
                      <svg width={12} height={12} viewBox="0 0 20 20" fill="#4adf5a" style={{ flexShrink: 0 }}>
                        <polygon points="4,2 4,18 17,10" />
                      </svg>
                    </button>
                  </div>

                  {/* Point directly to the horizontal volume control below. */}
                  <div style={{
                    position: "absolute",
                    left: "50%",
                    bottom: -50,
                    width: 34,
                    height: 50,
                    transform: "translateX(-50%)",
                    zIndex: 2,
                    pointerEvents: "none",
                  }}>
                    <svg width="34" height="50" viewBox="0 0 34 50" fill="none" aria-hidden="true">
                      <line x1="17" y1="2" x2="17" y2="35" stroke="#ffcc00" strokeWidth="3" strokeLinecap="round" />
                      <polygon points="5,33 29,33 17,48" fill="#ffcc00" />
                    </svg>
                  </div>

                </div>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          PROCESS CONFIRMATION PAGE — shown immediately after clicking PROCESS
      ════════════════════════════════════════════════════════════════════════ */}
      {page === "confirm" && statFreq !== null && (
        <div className="ringmatch-confirm-overlay" onClick={e => e.stopPropagation()} style={{
          position: "absolute", inset: 0, zIndex: 90,
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingTop: "max(24px, calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 22px))",
          paddingBottom: "max(24px, calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 22px))",
          paddingLeft: "max(clamp(28px,7cqw,44px), calc(var(--safe-area-inset-left, env(safe-area-inset-left, 0px)) + 22px))",
          paddingRight: "max(clamp(28px,7cqw,44px), calc(var(--safe-area-inset-right, env(safe-area-inset-right, 0px)) + 22px))",
          boxSizing: "border-box",
        }}>
          <div className="ringmatch-confirm-panel" style={{
            position: "relative", width: "100%", maxWidth: 390,
            maxHeight: "calc(100dvh - max(48px, calc((var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))) + 44px)))",
            filter: "drop-shadow(0 14px 52px rgba(0,0,0,0.92))",
            animation: "statScaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
            <img src={freqTestPane} alt="" draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", display: "block" }} />

            <button onClick={handleClose} aria-label="Close confirmation" style={{
              position: "absolute", top: 0, left: 0, zIndex: 11,
              width: 34, height: 34, borderRadius: "50%",
              transform: "translate(-45%, -45%)",
              background: "rgba(10,18,16,0.475)", border: "1px solid rgba(0,200,180,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
              ...KALLISTO, color: "rgba(255,255,255,0.90)", fontSize: 17, fontWeight: 700,
            }}>✕</button>

            <div style={{
              position: "relative", zIndex: 1,
              display: "flex", flexDirection: "column",
              padding: "clamp(20px,6svh,32px) clamp(20px,5cqw,28px) clamp(22px,5svh,30px) clamp(24px,6cqw,34px)",
            }}>

              {/* Title — "Your RingMatch™ / frequency selection:" */}
              <p style={{ ...KALLISTO, fontWeight: 400, fontSize: "clamp(13px,3.2cqw,15px)", color: "rgba(255,255,255,0.90)", lineHeight: 1.35, marginBottom: 14 }}>
                Your <strong style={{ fontWeight: 800 }}>RingMatch</strong><sup style={{ fontSize: "0.52em", fontWeight: 300, verticalAlign: "0.38em", color: "rgba(255,255,255,0.6)" }}>™</sup><br />
                frequency selection:
              </p>

              {/* Frequency pill */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid #4adf5a", borderRadius: 7, padding: "5px 14px", marginBottom: 16, alignSelf: "flex-start" }}>
                <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(15px,3.8cqw,17px)", color: "#fff", letterSpacing: "0.05em" }}>{fmtSub(statFreq)}</span>
                <span style={{ color: "#4adf5a", fontSize: "clamp(16px,4cqw,18px)", lineHeight: 1 }}>✓</span>
              </div>

              <div style={{ ...KALLISTO, marginBottom: 18 }}>
                <p style={{ margin: "0 0 7px", color: "rgba(255,255,255,.92)", fontSize: "clamp(12px,3cqw,14px)", lineHeight: 1.35 }}>
                  Best soundscapes to target<br />YOUR specific frequency:
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "2px 18px", color: "#00ff55", fontSize: "clamp(13px,3.25cqw,15px)", fontWeight: 700 }}>
                  {recommendedCategories.map(category => <span key={category}>{category}</span>)}
                </div>
                <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,.86)", fontSize: "clamp(11px,2.75cqw,12.5px)", lineHeight: 1.35 }}>
                  Matched soundscapes will be marked with an <span style={{ color: "#ffcc00" }}>asterisk *</span>
                </p>
              </div>

              {/* Section heading — "FREQUENCY-NOTCHING (optional)" */}
              <p style={{ ...KALLISTO, fontSize: "clamp(11px,2.7cqw,12.5px)", letterSpacing: "0.06em", marginBottom: 10, lineHeight: 1.3 }}>
                <strong style={{ fontWeight: 800, color: "#ffcc00" }}>FREQUENCY-NOTCHING</strong>
                <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.70)" }}> (optional)</span>
              </p>

              {/* Body paragraphs */}
              <p style={{ ...KALLISTO, fontWeight: 400, fontSize: "clamp(11px,2.75cqw,12.5px)", color: "rgba(255,255,255,0.82)", lineHeight: 1.60, marginBottom: 9 }}>
                <strong style={{ fontWeight: 700, color: "#fff" }}>earphoria</strong><sup style={{ fontSize: "0.52em", fontWeight: 300, verticalAlign: "0.38em", color: "rgba(255,255,255,0.6)" }}>™</sup> can personalize your soundscapes by reducing—or “notching”—a narrow range around your selected frequency.
              </p>
              <p style={{ ...KALLISTO, fontWeight: 400, fontSize: "clamp(11px,2.75cqw,12.5px)", color: "rgba(255,255,255,0.82)", lineHeight: 1.60, marginBottom: 9 }}>
                Notched audio is a developing, research-informed approach that some people with tonal tinnitus choose to explore. Individual experiences vary, and benefits are not guaranteed.
              </p>
              <p style={{ ...KALLISTO, fontWeight: 400, fontSize: "clamp(11px,2.75cqw,12.5px)", color: "rgba(255,255,255,0.82)", lineHeight: 1.60, marginBottom: 16 }}>
                 <strong style={{ fontWeight: 700, color: "#fff" }}>Select an option below</strong> to apply or skip your personalized notch. Any notch will apply to all soundscapes within this app, and will remain active until you return to the RingMatch<sup style={{ fontSize: "0.52em", fontWeight: 300, verticalAlign: "0.38em", color: "rgba(255,255,255,0.6)" }}>™</sup> section and change or reset it.
               </p>

              {/* Confirmation choices */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, width: "100%" }}>
                <button
                  className="ringmatch-confirm-choice"
                  onClick={() => { onBoost(null); onNotch(statFreq!); setPage("confirm2"); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
                    width: "100%", minHeight: 34, padding: "5px 9px", cursor: "pointer",
                    ...KALLISTO, fontSize: "clamp(11px,2.85cqw,13px)", letterSpacing: ".035em",
                    color: "rgba(255,255,255,.88)", textAlign: "right",
                  }}
                >
                  <span><strong style={{ color: "#ffcc00", fontWeight: 700 }}>notch</strong> {fmtSub(statFreq)} from my playback</span>
                  <span aria-hidden="true" style={{ color: "#ffcc00", fontSize: 15, lineHeight: 1 }}>▶</span>
                </button>
                <button
                  className="ringmatch-confirm-choice"
                  onClick={() => { onNotch(null); onBoost(null); onClose(); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
                    width: "100%", minHeight: 34, padding: "5px 9px", cursor: "pointer",
                    ...KALLISTO, fontSize: "clamp(11px,2.85cqw,13px)", letterSpacing: ".035em",
                    color: "rgba(255,255,255,.88)", textAlign: "right",
                  }}
                >
                  <span>keep selection but don't notch</span>
                  <span aria-hidden="true" style={{ color: "#ffcc00", fontSize: 15, lineHeight: 1 }}>▶</span>
                </button>
                <button
                  className="ringmatch-confirm-choice"
                  onClick={handleReset}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
                    width: "100%", minHeight: 34, padding: "5px 9px", cursor: "pointer",
                    ...KALLISTO, fontSize: "clamp(11px,2.85cqw,13px)", letterSpacing: ".035em",
                    color: "rgba(255,255,255,.68)", textAlign: "right",
                  }}
                >
                  <span>reset and cancel</span>
                  <span aria-hidden="true" style={{ color: "rgba(255,255,255,.68)", fontSize: 15, lineHeight: 1 }}>▶</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          NOTCH APPLIED CONFIRMATION — shown only after choosing to notch
      ════════════════════════════════════════════════════════════════════════ */}
      {page === "confirm2" && statFreq !== null && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "absolute", inset: 0, zIndex: 95,
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingTop: "max(24px, calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 22px))",
          paddingBottom: "max(24px, calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 22px))",
          paddingLeft: "max(clamp(42px,10cqw,72px), calc(var(--safe-area-inset-left, env(safe-area-inset-left, 0px)) + 22px))",
          paddingRight: "max(clamp(42px,10cqw,72px), calc(var(--safe-area-inset-right, env(safe-area-inset-right, 0px)) + 22px))",
          boxSizing: "border-box",
        }}>
          <div style={{
            position: "relative",
            width: "100%",
            maxWidth: 340,
            maxHeight: "calc(100dvh - max(48px, calc((var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))) + 44px)))",
            padding: "clamp(42px,7svh,54px) clamp(24px,6cqw,34px) clamp(22px,4svh,28px)",
            border: 0,
            background: `transparent url("${img("PopupBGpane.png")}") center / 100% 100% no-repeat`,
            filter: "drop-shadow(0 16px 52px rgba(0,0,0,0.9))",
            animation: "statScaleIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
            <button onClick={handleClose} aria-label="Close notch confirmation" style={{
              position: "absolute", top: 0, left: 0, zIndex: 11,
              width: 34, height: 34, borderRadius: "50%",
              transform: "translate(-45%, -45%)",
              background: "rgba(10,18,16,0.475)", border: "1px solid rgba(0,200,180,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
              ...KALLISTO, color: "rgba(255,255,255,0.90)", fontSize: 17, fontWeight: 700,
            }}>✕</button>

            <p style={{
              ...KALLISTO,
              margin: "0 0 clamp(24px,4svh,32px)",
              color: "#fff",
              fontSize: "clamp(16px,4cqw,20px)",
              lineHeight: 1.55,
              textAlign: "center",
              fontWeight: 400,
            }}>
              You have selected to <strong style={{ color: "#ffcc00", fontWeight: 800 }}>notch</strong>{" "}
              <strong style={{ color: "#ffcc00", fontWeight: 800 }}>{fmtSub(statFreq)}</strong> from your playback!
            </p>

            <button onClick={handleClose} style={{
              display: "block",
              minWidth: 94,
              margin: "0 auto",
              padding: "8px 20px",
              borderRadius: 7,
              border: "1px solid rgba(255,204,0,0.8)",
              background: "rgba(0,0,0,0.18)",
              boxShadow: "0 0 12px rgba(255,204,0,0.15)",
              cursor: "pointer",
              ...KALLISTO,
              color: "#fff",
              fontSize: "clamp(13px,3.2cqw,15px)",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}>OK</button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          STATUS WINDOW — shown whenever a frequency has been selected
      ════════════════════════════════════════════════════════════════════════ */}
      {page === "stat" && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "absolute", inset: 0, zIndex: 90,
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingTop: "max(24px, calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 22px))",
          paddingBottom: "max(24px, calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 22px))",
          paddingLeft: "max(clamp(22px,5.5cqw,56px), calc(var(--safe-area-inset-left, env(safe-area-inset-left, 0px)) + 22px))",
          paddingRight: "max(clamp(22px,5.5cqw,56px), calc(var(--safe-area-inset-right, env(safe-area-inset-right, 0px)) + 22px))",
          boxSizing: "border-box",
        }}>

          <div style={{
            position: "relative",
            width: "100%",
            maxWidth: 590,
            height: "min(calc(100svh - max(48px, calc((var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))) + 44px))), 650px)",
            filter: "drop-shadow(0 14px 52px rgba(0,0,0,0.92))",
            willChange: "transform, opacity",
            animation: statDismissing
              ? "statScaleOut 0.2s cubic-bezier(0.4,0,1,1) both"
              : "statScaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>

            {/* Supplied rounded popup pane */}
            <img src={img("PopupBGpane.png")} alt="" draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", display: "block" }} />

            {/* X straddles the perceived rounded corner */}
            <button onClick={handleClose} aria-label="Close status" style={{
              position: "absolute", top: 0, left: 0, zIndex: 11,
              width: 34, height: 34, borderRadius: "50%",
              transform: "translate(-45%, -45%)",
              background: "rgba(10,18,16,0.475)", border: "1px solid rgba(0,200,180,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
              ...KALLISTO, color: "rgba(255,255,255,0.90)", fontSize: 17, fontWeight: 700,
            }}>✕</button>

            {/* Left-aligned status composition modeled after the supplied reference */}
            <div style={{
              position: "relative", zIndex: 1,
              height: "100%",
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              padding: "clamp(72px,15%,98px) 10% clamp(28px,5%,38px) 14%",
              textAlign: "left",
            }}>

              <div style={{
                ...KALLISTO,
                fontWeight: 700,
                fontSize: "clamp(15px,3.25vw,21px)",
                color: "rgba(255,255,255,0.90)",
                letterSpacing: "0.055em",
                marginBottom: "clamp(8px,1.5svh,12px)",
              }}>
                Your selected tinnitus frequency:<span style={{ color: "#ffcc00", fontSize: "1.2em", lineHeight: 1 }}>*</span>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "22px auto 34px",
                alignItems: "center",
                columnGap: 8,
                marginLeft: "7%",
                marginBottom: "clamp(42px,7svh,68px)",
              }}>
                <span style={{
                  color: "#d8d900",
                  fontSize: "clamp(17px,3.8vw,24px)",
                  lineHeight: 1,
                }}>▶</span>
                <span style={{
                  ...KALLISTO,
                  fontWeight: 700,
                  fontSize: "clamp(20px,4.4vw,28px)",
                  color: "#d8d900",
                  letterSpacing: "0.05em",
                }}>
                  {statFreq !== null ? fmtStatus(statFreq) : "—"}
                </span>
                {statFreq !== null && (
                  <span style={{
                    color: "rgba(255,255,255,.90)",
                    fontSize: "clamp(26px,5.2vw,34px)",
                    fontWeight: 300,
                    lineHeight: 1,
                    transform: "rotate(-12deg)",
                  }}>✓</span>
                )}
              </div>

              <div style={{
                ...KALLISTO,
                fontWeight: 700,
                fontSize: "clamp(16px,3.5vw,22px)",
                color: "rgba(255,255,255,0.90)",
                letterSpacing: "0.07em",
                marginBottom: "clamp(8px,1.5svh,12px)",
              }}>
                Listening mode:
              </div>

              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "clamp(5px,1svh,9px)",
                marginLeft: "7%",
                marginBottom: "clamp(38px,6svh,58px)",
              }}>
                {(["normal", "notch"] as const).map(mode => {
                  const active = currentMode === mode;
                  return (
                    <button key={mode}
                      onClick={() => handleModeChange(mode)}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                        display: "grid",
                        gridTemplateColumns: "22px auto 34px",
                        alignItems: "center",
                        columnGap: 8,
                      }}>
                      <span style={{
                        color: active ? (mode === "normal" ? "rgba(255,255,255,.90)" : "#d8d900") : "rgba(255,255,255,.38)",
                        fontSize: "clamp(17px,3.8vw,24px)",
                        lineHeight: 1,
                        transition: "color 0.12s",
                      }}>{active ? "▶" : "▷"}</span>
                      <span style={{
                        ...KALLISTO,
                        fontWeight: active ? 700 : 300,
                        fontSize: "clamp(16px,3.5vw,22px)",
                        color: active ? (mode === "normal" ? "rgba(255,255,255,.90)" : "#d8d900") : "rgba(255,255,255,0.55)",
                        letterSpacing: "0.09em",
                        transition: "color 0.12s",
                      }}>
                        {mode === "notch" ? "notched" : "normal"}
                      </span>
                      <span style={{
                        visibility: active ? "visible" : "hidden",
                        color: "rgba(255,255,255,.90)",
                        fontSize: "clamp(26px,5.2vw,34px)",
                        fontWeight: 300,
                        lineHeight: 1,
                        transform: "rotate(-12deg)",
                      }}>✓</span>
                    </button>
                  );
                })}
              </div>

              <button onClick={handleRepeatTest}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  display: "flex", alignItems: "center", gap: 12,
                  marginLeft: "2%",
                  marginBottom: "clamp(13px,2.3svh,19px)",
                }}>
                <span style={{ ...KALLISTO, display: "inline-block", transform: "scaleY(.85)", fontWeight: 400, fontSize: "clamp(18px,4vw,25px)", color: "#d8d900", letterSpacing: "0.08em" }}>
                  Repeat Test
                </span>
                <span style={{ fontSize: "clamp(20px,4.4vw,28px)", fontWeight: 300, color: "#d8d900", lineHeight: 1 }}>»</span>
              </button>

              <button onClick={handleReset}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  display: "flex", alignItems: "center", gap: 12,
                  marginLeft: "3%",
                  marginBottom: "clamp(18px,3.2svh,28px)",
                }}>
                <span style={{ ...KALLISTO, display: "inline-block", transform: "scaleY(.85)", fontWeight: 400, fontSize: "clamp(18px,4vw,25px)", color: "rgba(255,255,255,0.80)", letterSpacing: "0.09em" }}>
                  Reset
                </span>
                <span style={{ fontSize: "clamp(20px,4.4vw,28px)", fontWeight: 300, color: "rgba(255,255,255,0.80)", lineHeight: 1 }}>»</span>
              </button>

              <button
                onClick={handleShowInstructions}
                aria-label="Show RingMatch instructions"
                style={{
                  width: "clamp(34px,7vw,44px)",
                  height: "clamp(34px,7vw,44px)",
                  marginLeft: "4%",
                  borderRadius: "50%",
                  border: "1px solid rgba(216,217,0,.72)",
                  background: "rgba(22,50,43,.3)",
                  color: "#d8d900",
                  fontSize: "clamp(22px,4.6vw,29px)",
                  fontWeight: 500,
                  lineHeight: 1,
                  cursor: "pointer",
                  padding: 0,
                }}
              >?</button>

              <button
                onClick={handleClose}
                style={{
                  position: "absolute",
                  right: "10%",
                  bottom: "7%",
                  transform: "scale(.85)",
                  transformOrigin: "bottom right",
                  minWidth: "clamp(64px,15vw,92px)",
                  padding: "clamp(7px,1.2svh,10px) 18px",
                  borderRadius: 22,
                  border: "1.5px solid rgba(74,223,90,.58)",
                  background: "linear-gradient(135deg, rgba(0,72,27,.154), rgba(0,112,43,.147))",
                  boxShadow: "0 2px 7px rgba(0,0,0,.16), inset 0 0 5px rgba(74,223,90,.04)",
                  color: "#62ed72",
                  cursor: "pointer",
                  ...KALLISTO,
                  fontSize: "clamp(14px,3.1vw,19px)",
                  fontWeight: 700,
                  letterSpacing: ".08em",
                }}
              >
                OK
              </button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
