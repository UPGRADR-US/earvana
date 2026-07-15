import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import freqTestP1Img from "@assets/freqtest_p1_1784147052188.png";
import freqTestP2Img from "@assets/freqtest_p2_1784147052188.png";
import freqTestPane  from "@assets/freqtest_emptypane_1784147052188.png";

const BASE = import.meta.env.BASE_URL;
const img  = (name: string) => `${BASE}${name}`;

// Eagerly decode all panel images so they're cached before the user navigates to each page
const _PRELOAD_IMGS = [freqTestP1Img, freqTestP2Img, freqTestPane].map(src => {
  const im = new window.Image();
  im.src = src;
  return im;
});

const KALLISTO: React.CSSProperties = { fontFamily: "'Figtree', sans-serif", transform: "scaleY(0.9)", transformOrigin: "center center" };
const WIPE_MS    = 340;
const TONE_MAX_GAIN = 0.120;

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
  band, expandedBand, blinkingBand, playingFreq, activeBandLabel,
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
      <div style={{ display: "flex", alignItems: "center", minHeight: 34 }}>

        <div style={{ width: "33%", flexShrink: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", paddingRight: 14 }}>
          {(isPlaying || isExpanded || isBlinking) && (
            <button
              onClick={() => {
                if (isExpanded) { onStopTone(); onSetExpandedBand(null); }
                else            { onBandExpand(band.label); }
              }}
              style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {!isExpanded && (
                <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(7px,1.8vw,9px)", color: "#ffcc00", letterSpacing: "0.07em", marginRight: 6 }}>EXPAND</span>
              )}
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
        </div>

        <button onClick={() => onBandPlay(band)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <span style={{
            ...LIST_TXT,
            fontSize: "clamp(15px,3.8cqw,18px)",
            fontWeight: (isPlaying || isExpanded || hasActive) ? 700 : 300,
            color: isPlaying ? "#00ff55" : isExpanded ? "#00cc44" : hasActive ? "#c8a832" : "rgba(255,255,255,0.72)",
          }}>{band.label}</span>
        </button>

        {!isExpanded && (
          <button onClick={() => onBandPlay(band)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center",
                     background: "none", border: "none", cursor: "pointer",
                     padding: 0, marginLeft: 6, flexShrink: 0 }}>
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
              display: "flex", alignItems: "center", minHeight: 32,
              borderRadius: sfActive ? 5 : 0,
              background: sfActive ? "rgba(184,154,42,0.10)" : "transparent",
            }}>

              <div style={{ width: "33%", flexShrink: 0 }} />

              <button onClick={() => onSubPlay(sf)}
                style={{ background: "none", border: "none", cursor: "pointer",
                         padding: 0, paddingLeft: 22, flexShrink: 0 }}>
                <span style={{
                  ...SUB_TXT,
                  fontSize: "clamp(13.5px,3.5cqw,16px)",
                  fontWeight: sfPlaying ? 700 : 300,
                  color: sfPlaying ? "#00ff55" : sfActive ? "#c8a832" : "rgba(255,255,255,0.65)",
                }}>{fmtSub(sf)}</span>
              </button>

              <button onClick={() => onSubPlay(sf)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center",
                         background: "none", border: "none", cursor: "pointer",
                         padding: 0, marginLeft: 6, flexShrink: 0 }}>
                <SpeakerIcon active={sfPlaying} size={14} />
              </button>

              {sfPlaying && !sfActive && (
                <button onClick={() => onSelectClick(sf)}
                  style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: 8, flexShrink: 0 }}>
                  <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(7px,1.8vw,9px)", color: "#ffcc00", letterSpacing: "0.07em" }}>PROCESS</span>
                  <Chevron color="#ffcc00" />
                </button>
              )}
              {sfActive && (
                <button onClick={() => { sfNotched ? onNotch(null) : onBoost(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: 8, flexShrink: 0 }}>
                  <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(10px,2.5vw,12px)", color: "#b89a2a", letterSpacing: "0.04em", animation: "blinkYellow 0.9s ease-in-out infinite" }}>RESET</span>
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
  onNotch:      (freq: number | null) => void;
  currentNotch: number | null;
  onBoost:      (freq: number | null) => void;
  currentBoost: number | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiagnosticsPanel({
  onClose, onStartTest, onNotch, currentNotch, onBoost, currentBoost,
}: Props) {
  const hasActiveSetting = currentNotch !== null || currentBoost !== null;

  // Page flow: 1 = instructions, 2 = pitch selector, "stat" = profile card
  const [page,           setPage]           = useState<1 | 2 | "stat">(() => hasActiveSetting ? "stat" : 1);
  // true when stat window was opened because a setting was already engaged (vs. just processed)
  const [statIsReturning, setStatIsReturning] = useState(hasActiveSetting);
  // the frequency anchored in the stat window (persists across mode changes)
  const [statFreq,       setStatFreq]       = useState<number | null>(() => currentNotch ?? currentBoost);
  const [playingFreq,    setPlayingFreq]     = useState<number | null>(null);
  const [expandedBand,   setExpandedBand]   = useState<string | null>(null);
  const [toneVolume,     setToneVolume]     = useState(0.25);
  const [startPressed,   setStartPressed]   = useState(false);
  const [p1ImgLoaded,    setP1ImgLoaded]    = useState(false);
  const [p2ImgLoaded,    setP2ImgLoaded]    = useState(false);
  const [backPressed,    setBackPressed]    = useState(false);
  const [p2Anchored,     setP2Anchored]     = useState(false);
  const [blinkingBand,   setBlinkingBand]   = useState<string | null>(null);
  const [statDismissing, setStatDismissing] = useState(false);

  const activeBandLabel = useMemo(() => {
    const active = currentNotch ?? currentBoost;
    if (!active) return null;
    return BANDS.find(b => getSubBands(b).includes(active))?.label ?? null;
  }, [currentNotch, currentBoost]);

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
    if (oscRef.current) { try { oscRef.current.stop(); } catch { /**/ } oscRef.current.disconnect(); oscRef.current = null; }
    if (gRef.current)   { try { gRef.current.disconnect(); } catch { /**/ } gRef.current = null; }
  }, []);

  const playTone = useCallback((freq: number, gain: number) => {
    killOsc();
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

  useEffect(() => { if (gRef.current) gRef.current.gain.value = volToGain(toneVolume); }, [toneVolume]);
  useEffect(() => () => { killOsc(); ctxRef.current?.close().catch(() => {}); }, [killOsc]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBandPlay = useCallback((band: Band) => {
    setExpandedBand(prev => (prev !== null && prev !== band.label) ? null : prev);
    setBlinkingBand(null);
    if (playingFreq === band.base) stopTone();
    else playTone(band.base, volToGain(toneVolume));
  }, [playingFreq, playTone, stopTone, toneVolume]);

  const handleBandExpand = useCallback((label: string) => {
    setExpandedBand(prev => prev === label ? null : label);
    setBlinkingBand(label);
    setP2Anchored(true);
  }, []);

  const handleSubPlay = useCallback((sf: number) => {
    if (playingFreq === sf) stopTone();
    else playTone(sf, volToGain(toneVolume));
  }, [playingFreq, playTone, stopTone, toneVolume]);

  // PROCESS: apply notch as default, anchor freq, open stat window
  const handleSelectClick = (freq: number) => {
    stopTone();
    onBoost(null);
    onNotch(freq);
    setStatFreq(freq);
    setStatIsReturning(false);
    setStatDismissing(false);
    setPage("stat");
  };

  // Stat window: live mode change
  const handleModeChange = (mode: "normal" | "notch" | "boost") => {
    const freq = statFreq;
    if (freq === null) return;
    if (mode === "normal") { onNotch(null); onBoost(null); }
    else if (mode === "notch") { onNotch(freq); onBoost(null); }
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

  // "reset >>" → clear notch/boost, close panel
  const handleReset = () => {
    onNotch(null); onBoost(null);
    setStatFreq(null);
    stopTone();
    onClose();
  };

  // p2 back → p1
  const handleBack = () => { stopTone(); setPage(1); setExpandedBand(null); setP2Anchored(false); setBlinkingBand(null); };
  const handleClose = () => { stopTone(); onClose(); };

  // Derive current mode from engine state
  const currentMode: "normal" | "notch" | "boost" =
    currentNotch !== null ? "notch" :
    currentBoost !== null ? "boost" : "normal";

  // Mode option label — 'ed' suffix for returning users
  const modeLabel = (m: "normal" | "notch" | "boost"): string => {
    if (m === "normal") return "normal";
    if (m === "notch")  return statIsReturning ? "notched" : "notch";
    return statIsReturning ? "boosted" : "boost";
  };

  // Slide positions — stat shows over whatever page is underneath
  const p1X    = page === 1 ? "0%" : "-100%";
  const p2X    = page === 2 ? "0%" : "100%";
  const wipeTx = `transform ${WIPE_MS}ms cubic-bezier(0.25,0.46,0.45,0.94)`;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-50" onClick={handleClose}>

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
      `}</style>

      {/* Blurred background */}
      <img src={img("homepage_BLUR_1784150009315.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* Shadow + animation wrapper — main panel (p1 / p2) */}
      <div onClick={e => e.stopPropagation()} style={{
        position: "absolute",
        top:    "clamp(48px,7.5vh,70px)",
        left:   "clamp(22px,5cqw,34px)",
        right:  "clamp(22px,5cqw,34px)",
        bottom: "clamp(48px,7vh,70px)",
        filter: page === "stat" ? "blur(6px)" : "drop-shadow(0 12px 40px rgba(0,0,0,0.78))",
        animation: "diagScaleIn 0.72s cubic-bezier(0.25,0.7,0.4,1) both",
        transition: "filter 0.4s ease",
      }}>

        {/* Carousel container */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: "inset(0 round 22px)" }}>

          {/* ✕ — hidden when stat window is showing */}
          <button onClick={handleClose} aria-label="Close" style={{
            position: "absolute", top: 0, left: 0, zIndex: 70,
            width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
            ...KALLISTO, fontWeight: 300, fontSize: "1.3rem", lineHeight: 1,
            color: "rgba(255,255,255,0.80)",
            background: "none", border: "none", cursor: "pointer",
            opacity: page === "stat" ? 0 : 1,
            pointerEvents: page === "stat" ? "none" : "auto",
            transition: "opacity 0.2s ease",
          }}>✕</button>

          {/* ════════════════════════════════════════════════════════════════════
              PAGE 1 — freqtest_p1 instructions + START TEST button
          ════════════════════════════════════════════════════════════════════ */}
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${p1X})`, transition: wipeTx, willChange: "transform" }}>
            <img src={freqTestP1Img} alt=""
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
              draggable={false}
              onLoad={() => setP1ImgLoaded(true)} />

            <button
              onPointerDown={() => setStartPressed(true)}
              onPointerUp={() => setStartPressed(false)}
              onPointerLeave={() => setStartPressed(false)}
              onClick={() => { onStartTest?.(); setPage(2); }}
              style={{
                position: "absolute", bottom: "5%", left: "50%", transform: "translateX(-50%)",
                visibility: p1ImgLoaded ? "visible" : "hidden",
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

          {/* ════════════════════════════════════════════════════════════════════
              PAGE 2 — freqtest_p2 base art + interactive list
          ════════════════════════════════════════════════════════════════════ */}
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${p2X})`, transition: wipeTx, willChange: "transform" }}>
            <img src={freqTestP2Img} alt=""
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
              draggable={false}
              onLoad={() => setP2ImgLoaded(true)} />

            <div style={{ visibility: p2ImgLoaded ? "visible" : "hidden" }}>
            <div style={{
              position: "absolute",
              top: "22%", bottom: "15%",
              left: 16, right: 36,
              overflowY: "auto",
              scrollbarWidth: "none",
              display: "flex",
              flexDirection: "column",
              justifyContent: p2Anchored ? "flex-start" : "center",
            }}>
              <div style={{ padding: "4px 0" }}>
                {BANDS.map(band => (
                <BandRow
                  key={band.label}
                  band={band}
                  expandedBand={expandedBand}
                  blinkingBand={blinkingBand}
                  playingFreq={playingFreq}
                  activeBandLabel={activeBandLabel}
                  currentNotch={currentNotch}
                  currentBoost={currentBoost}
                  onStopTone={stopTone}
                  onSetExpandedBand={setExpandedBand}
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

            {/* Volume meter — right column */}
            <div style={{
              position: "absolute",
              top: "22%", bottom: "15%",
              right: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <DiagVolMeter volume={toneVolume} onChange={setToneVolume} />
            </div>

            {/* Back button */}
            <button
              onPointerDown={() => setBackPressed(true)}
              onPointerUp={() => setBackPressed(false)}
              onPointerLeave={() => setBackPressed(false)}
              onClick={handleBack}
              style={{
                position: "absolute", bottom: "3%", left: 14, zIndex: 70,
                background: "none", border: "none", cursor: "pointer",
                ...KALLISTO, fontWeight: 700,
                fontSize: "clamp(11px,2.7cqw,13px)", letterSpacing: "0.04em",
                color: backPressed ? "#ffe880" : "#b89a2a",
                textShadow: backPressed ? "0 0 8px #ffd040, 0 0 20px #c09010" : "none",
                transition: "color 0.08s, text-shadow 0.08s",
              }}>«« back</button>

            </div>
          </div>

        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          STAT WINDOW — profile card (shown after PROCESS or for returning users)
      ════════════════════════════════════════════════════════════════════════ */}
      {page === "stat" && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "absolute", inset: 0, zIndex: 90,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 clamp(28px,7cqw,44px)",
        }}>

          <div style={{
            position: "relative", width: "100%", maxWidth: 340,
            filter: "drop-shadow(0 14px 52px rgba(0,0,0,0.92))",
            willChange: "transform, opacity",
            animation: statDismissing
              ? "statScaleOut 0.2s cubic-bezier(0.4,0,1,1) both"
              : "statScaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>

            {/* Background pane image */}
            <img src={freqTestPane} alt="" draggable={false}
              style={{ display: "block", width: "100%", height: "auto" }} />

            {/* ✕ close — top-left, outside card */}
            <button onClick={handleClose} style={{
              position: "absolute", top: -16, left: -16, zIndex: 11,
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(10,18,16,0.95)", border: "1px solid rgba(0,200,180,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
              ...KALLISTO, color: "rgba(255,255,255,0.82)", fontSize: 17, fontWeight: 700,
            }}>✕</button>

            {/* Content overlay */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              padding: "clamp(20px,6svh,32px) clamp(20px,5cqw,28px) clamp(22px,6svh,30px) clamp(28px,7cqw,38px)",
            }}>

              {/* Header */}
              <div style={{ marginBottom: "clamp(14px,4svh,20px)" }}>
                <div style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(15px,3.8cqw,18px)", color: "#7adf6a", letterSpacing: "0.06em" }}>
                  your earvana profile:
                </div>
              </div>

              {/* Dominant frequency */}
              <div style={{ marginBottom: "clamp(16px,4.5svh,22px)" }}>
                <div style={{ ...KALLISTO, fontWeight: 300, fontSize: "clamp(11px,2.8cqw,13px)", color: "rgba(220,240,230,0.65)", letterSpacing: "0.07em", marginBottom: 5 }}>
                  dominant frequency:
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(18px,4.6cqw,22px)", color: "#ffcc00", letterSpacing: "0.04em" }}>
                    {statFreq !== null ? fmtSub(statFreq) : "—"}
                  </span>
                  {statFreq !== null && (
                    <span style={{ color: "#7adf6a", fontSize: "clamp(17px,4.2cqw,20px)", lineHeight: 1 }}>✓</span>
                  )}
                </div>
              </div>

              {/* Listening mode */}
              <div style={{ flex: 1 }}>
                <div style={{ ...KALLISTO, fontWeight: 300, fontSize: "clamp(11px,2.8cqw,13px)", color: "rgba(220,240,230,0.65)", letterSpacing: "0.07em", marginBottom: 8 }}>
                  listening mode:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "clamp(6px,1.8svh,10px)", paddingLeft: 8 }}>
                  {(["normal", "notch", "boost"] as const).map(mode => {
                    const active = currentMode === mode;
                    return (
                      <button key={mode}
                        onClick={() => handleModeChange(mode)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                        }}>
                        <span style={{
                          ...KALLISTO,
                          fontWeight: active ? 700 : 300,
                          fontSize: "clamp(13px,3.2cqw,15px)",
                          color: active ? "rgba(220,240,230,0.95)" : "rgba(180,210,195,0.42)",
                          letterSpacing: "0.05em",
                          transition: "color 0.12s",
                        }}>
                          {modeLabel(mode)}
                        </span>
                        {active && (
                          <span style={{ color: "#7adf6a", fontSize: "clamp(14px,3.4cqw,16px)", lineHeight: 1 }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "clamp(8px,2.2svh,12px)", marginTop: "clamp(16px,4svh,22px)" }}>

                <button onClick={handleRepeatTest}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                  <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(14px,3.5cqw,17px)", color: "#ffcc00", letterSpacing: "0.09em" }}>
                    repeat test
                  </span>
                  <DblChevron color="#ffcc00" />
                </button>

                <button onClick={handleReset}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                  <span style={{ ...KALLISTO, fontWeight: 400, fontSize: "clamp(13px,3.2cqw,15px)", color: "rgba(220,240,230,0.72)", letterSpacing: "0.09em" }}>
                    reset
                  </span>
                  <DblChevron color="rgba(220,240,230,0.72)" />
                </button>

              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
