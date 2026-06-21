import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import diagP1Img   from "@assets/diagNEW_p1_1781898279568.png";
import diagP2Img   from "@assets/diagNEW_base_p2_1781898314245.png";
import diagCardImg from "@assets/diagNEW_base_p3-4_1781898318899.png";

const BASE = import.meta.env.BASE_URL;
const img  = (name: string) => `${BASE}${name}`;

const KALLISTO: React.CSSProperties = { fontFamily: "'Kallisto', sans-serif" };
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
  return `${(hz / 1000).toFixed(1)} khz`;   // always show .0 (4.0 khz, not 4 khz)
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

function Chevron({ color = "#ffcc00" }: { color?: string }) {
  return (
    <svg width={8} height={10} viewBox="0 0 10 14" style={{ flexShrink: 0 }}>
      <polyline points="2,2 8,7 2,12"
        fill="none" stroke={color} strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Shared text styles ───────────────────────────────────────────────────────
// Defined at module level so BandRow (also module-level) can reference them.
const LIST_TXT: React.CSSProperties = { ...KALLISTO, letterSpacing: "0.09em" };
const SUB_TXT:  React.CSSProperties = { ...KALLISTO, letterSpacing: "0.11em" };

// ─── BandRow ──────────────────────────────────────────────────────────────────
// MUST be a top-level memo component — if defined inside DiagnosticsPanel React
// treats every render as a new component type, unmounts+remounts all rows, and
// CSS transitions are destroyed before they can play.

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
      {/* ── Parent row ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", minHeight: 34 }}>

        {/* Gutter 33% — EXPAND + chevron when playing; chevron rotates right→down */}
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
                animation: isBlinking ? "blinkYellow 0.85s ease-in-out infinite" : "none",
              }}>
                <polyline points="2,2 8,7 2,12"
                  fill="none" stroke="#ffcc00" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Label — auto width, inline with speaker */}
        <button onClick={() => onBandPlay(band)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <span style={{
            ...LIST_TXT,
            fontSize: "clamp(13.5px,3.5vw,16px)",
            fontWeight: (isPlaying || isExpanded || hasActive) ? 700 : 300,
            color: isPlaying ? "#00ff55" : isExpanded ? "#00cc44" : hasActive ? "#c8a832" : "rgba(255,255,255,0.72)",
          }}>{band.label}</span>
        </button>

        {/* Speaker — inline, 6px right of label; hidden when expanded */}
        {!isExpanded && (
          <button onClick={() => onBandPlay(band)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center",
                     background: "none", border: "none", cursor: "pointer",
                     padding: 0, marginLeft: 6, flexShrink: 0 }}>
            <SpeakerIcon active={isPlaying} size={15} />
          </button>
        )}

      </div>

      {/* ── Sub-band accordion ─────────────────────────────────────────────── */}
      {/* grid-template-rows 0fr→1fr: animates to exact content height.
          minHeight:0 on the inner div is required for 0fr to actually collapse. */}
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

              {/* Gutter 33% — empty, keeps sub-label aligned with parent label */}
              <div style={{ width: "33%", flexShrink: 0 }} />

              {/* Label — indented 22px, auto width, inline with speaker */}
              <button onClick={() => onSubPlay(sf)}
                style={{ background: "none", border: "none", cursor: "pointer",
                         padding: 0, paddingLeft: 22, flexShrink: 0 }}>
                <span style={{
                  ...SUB_TXT,
                  fontSize: "clamp(12.5px,3.2vw,15px)",
                  fontWeight: sfPlaying ? 700 : 300,
                  color: sfPlaying ? "#00ff55" : sfActive ? "#c8a832" : "rgba(255,255,255,0.65)",
                }}>{fmtSub(sf)}</span>
              </button>

              {/* Speaker — inline, 6px right of label */}
              <button onClick={() => onSubPlay(sf)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center",
                         background: "none", border: "none", cursor: "pointer",
                         padding: 0, marginLeft: 6, flexShrink: 0 }}>
                <SpeakerIcon active={sfPlaying} size={14} />
              </button>

              {/* PROCESS / reset — right of speaker */}
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
                  <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(6.5px,1.65vw,8.5px)", color: "#b89a2a", letterSpacing: "0.04em" }}>reset</span>
                  <Chevron color="#b89a2a" />
                </button>
              )}

            </div>
          );
        })}
      </div>{/* end inner clip */}
      </div>{/* end outer grid */}

    </div>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onClose:      () => void;
  onNotch:      (freq: number | null) => void;
  currentNotch: number | null;
  onBoost:      (freq: number | null) => void;
  currentBoost: number | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiagnosticsPanel({
  onClose, onNotch, currentNotch, onBoost, currentBoost,
}: Props) {
  const [page,             setPage]             = useState<1 | 2>(1);
  const [playingFreq,      setPlayingFreq]       = useState<number | null>(null);
  const [expandedBand,     setExpandedBand]      = useState<string | null>(null);
  const [toneVolume,       setToneVolume]        = useState(0.25);
  const [processCandidate, setProcessCandidate]  = useState<number | null>(null);
  const [doneAction,       setDoneAction]        = useState<{ freq: number; type: "notch" | "boost" } | null>(null);
  const [startPressed,     setStartPressed]      = useState(false);
  const [backPressed,      setBackPressed]       = useState(false);
  // true once the user has interacted on this p2 visit; locks justify to flex-start
  // so the list never re-centers mid-session. Resets only on page transitions.
  const [p2Anchored,       setP2Anchored]        = useState(false);
  // which band's chevron should blink; persists after collapse until another parent row is clicked
  const [blinkingBand,     setBlinkingBand]      = useState<string | null>(null);
  // true while the PROCESS popup is animating out (scale-to-zero)
  const [processDismissing, setProcessDismissing] = useState(false);

  const activeBandLabel = useMemo(() => {
    const active = currentNotch ?? currentBoost;
    if (!active) return null;
    return BANDS.find(b => getSubBands(b).includes(active))?.label ?? null;
  }, [currentNotch, currentBoost]);

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

  // Clicking a band label or its speaker: play root pitch, turn green, show EXPAND.
  // Also clears the blinking chevron (another parent was clicked).
  const handleBandPlay = useCallback((band: Band) => {
    setExpandedBand(prev => (prev !== null && prev !== band.label) ? null : prev);
    setBlinkingBand(null);
    if (playingFreq === band.base) stopTone();
    else playTone(band.base, volToGain(toneVolume));
  }, [playingFreq, playTone, stopTone, toneVolume]);

  // Clicking EXPAND: expand/collapse the band (tone keeps playing).
  // Sets the blinking chevron to this band, locks vertical centering.
  const handleBandExpand = useCallback((label: string) => {
    setExpandedBand(prev => prev === label ? null : label);
    setBlinkingBand(label);
    setP2Anchored(true);
  }, []);

  // Clicking a sub-freq label or its speaker: play, turn green, show PROCESS
  const handleSubPlay = useCallback((sf: number) => {
    if (playingFreq === sf) stopTone();
    else playTone(sf, volToGain(toneVolume));
  }, [playingFreq, playTone, stopTone, toneVolume]);

  // Clicking SELECT (sub-freq): stop tone and open modal
  const handleSelectClick = (freq: number) => { stopTone(); setProcessDismissing(false); setProcessCandidate(freq); };

  // Close PROCESS popup with scale-out animation, then clear state
  const handleProcessClose = () => {
    setProcessDismissing(true);
    setTimeout(() => { setProcessCandidate(null); setProcessDismissing(false); }, 200);
  };

  const handleNotch = () => {
    if (processCandidate === null) return;
    onBoost(null); onNotch(processCandidate);
    setDoneAction({ freq: processCandidate, type: "notch" });
    setProcessCandidate(null);
  };

  const handleBoost = () => {
    if (processCandidate === null) return;
    onNotch(null); onBoost(processCandidate);
    setDoneAction({ freq: processCandidate, type: "boost" });
    setProcessCandidate(null);
  };

  const handleDoneClose = () => { setDoneAction(null); onClose(); };
  // p2 «back» → p1: reset anchor + blink so p2 re-centers next time it's entered
  const handleBack = () => { setDoneAction(null); stopTone(); setPage(1); setExpandedBand(null); setP2Anchored(false); setBlinkingBand(null); };
  // Done card «back» → p2 (not p1): also re-centers p2 on return
  const handleBackFromDone = () => { setDoneAction(null); stopTone(); setPage(2); setP2Anchored(false); setBlinkingBand(null); };
  const handleClose = () => { stopTone(); onClose(); };

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
        @keyframes processScaleIn {
          0%   { transform: scale(0.05); opacity: 0; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @keyframes processScaleOut {
          0%   { transform: scale(1);    opacity: 1; }
          100% { transform: scale(0.05); opacity: 0; }
        }
      `}</style>

      {/* Blurred background */}
      <img src={img("homepage_BLUR.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* Shadow + animation wrapper */}
      <div onClick={e => e.stopPropagation()} style={{
        position: "absolute",
        top:    "clamp(48px,7.5vh,70px)",
        left:   "clamp(22px,5cqw,34px)",
        right:  "clamp(22px,5cqw,34px)",
        bottom: "clamp(48px,7vh,70px)",
        filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.78))",
        animation: "diagScaleIn 0.72s cubic-bezier(0.25,0.7,0.4,1) both",
      }}>

        {/* Carousel container */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: "inset(0 round 22px)" }}>

          {/* Global ✕ — hidden while PROCESS popup is open */}
          <button onClick={handleClose} aria-label="Close" style={{
            position: "absolute", top: 0, left: 0, zIndex: 70,
            width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
            ...KALLISTO, fontWeight: 500, fontSize: "1.55rem", lineHeight: 1,
            color: "rgba(255,255,255,0.80)",
            opacity: processCandidate !== null ? 0 : 1,
            pointerEvents: processCandidate !== null ? "none" : "auto",
            transition: "opacity 0.2s ease",
          }}>✕</button>

          {/* ════════════════════════════════════════════════════════════════════
              PAGE 1 — burned-in art + START TEST overlay
          ════════════════════════════════════════════════════════════════════ */}
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${p1X})`, transition: wipeTx, willChange: "transform" }}>
            <img src={diagP1Img} alt=""
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
              draggable={false} />

            <button
              onPointerDown={() => setStartPressed(true)}
              onPointerUp={() => setStartPressed(false)}
              onPointerLeave={() => setStartPressed(false)}
              onClick={() => setPage(2)}
              style={{
                position: "absolute", bottom: "4%", left: "50%", transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                background: "none", border: "none", cursor: "pointer",
                ...KALLISTO, fontWeight: 700, letterSpacing: "0.12em",
                color: startPressed ? "#ccffcc" : "#00ee44",
                textShadow: startPressed
                  ? "0 0 8px #00ff66, 0 0 20px #00dd44, 0 0 40px #00aa33"
                  : "0 0 6px rgba(0,220,60,0.45)",
                transition: "color 0.08s, text-shadow 0.08s",
              }}>
              <span style={{ fontSize: "clamp(13px,3.5vw,16px)" }}>START TEST</span>
              <svg width={22} height={22} viewBox="0 0 20 20" style={{ marginTop: 1, transform: "rotate(-90deg)" }}>
                <polygon points="2,4 18,4 10,17"
                  fill={startPressed ? "#ccffcc" : "#00ee44"}
                  style={{ filter: startPressed ? "drop-shadow(0 0 5px #00ff55)" : "drop-shadow(0 0 3px rgba(0,220,60,0.5))" }} />
              </svg>
            </button>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              PAGE 2 — base art + interactive list
          ════════════════════════════════════════════════════════════════════ */}
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${p2X})`, willChange: "transform", filter: processCandidate !== null ? "blur(8px)" : "none", transition: `${wipeTx}, filter 0.5s ease` }}>
            <img src={diagP2Img} alt=""
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
              draggable={false} />

            {/* Frequency list — in the blank area between the two gold dividers */}
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

        </div>{/* end carousel */}
      </div>{/* end shadow wrapper */}

      {/* ════════════════════════════════════════════════════════════════════════
          PROCESS modal  (p3)
      ════════════════════════════════════════════════════════════════════════ */}
      {processCandidate !== null && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "absolute", inset: 0, zIndex: 80,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 clamp(12px,3cqw,20px)",
        }}>

          {/* Invisible backdrop — tap outside card to dismiss */}
          <div style={{ position: "absolute", inset: 0 }} onClick={handleProcessClose} />

          {/* Popup card — scales in/out */}
          <div style={{
            position: "relative", zIndex: 10, width: "100%", maxWidth: 330,
            animation: processDismissing
              ? "processScaleOut 0.2s cubic-bezier(0.4,0,1,1) both"
              : "processScaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>

            {/* ✕ close button — top-left corner of card */}
            <button onClick={handleProcessClose} style={{
              position: "absolute", top: -13, left: -13, zIndex: 11,
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(22,24,28,0.96)", border: "1px solid rgba(255,255,255,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
              ...KALLISTO, color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: 700,
            }}>✕</button>

            <img src={diagCardImg} alt="" draggable={false}
              style={{ display: "block", width: "100%", height: "auto",
                       filter: "drop-shadow(0 14px 48px rgba(0,0,0,0.90))" }} />

            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              padding: "clamp(14px,4svh,22px) 18px clamp(22px,5.5svh,30px)",
            }}>

              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(13px,3.3vw,15px)", fontWeight: 700, marginBottom: 2 }}>
                  Great!
                </div>
                <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(11.5px,2.9vw,13.5px)", lineHeight: 1.4 }}>
                  You've pinpointed
                </div>
                <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.95)", fontSize: "clamp(20px,5.2vw,25px)", fontWeight: 700, lineHeight: 1.2, margin: "3px 0" }}>
                  {fmtSub(processCandidate)}
                </div>
                <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(11.5px,2.9vw,13.5px)" }}>
                  as your tinnitus frequency.
                </div>
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.60)", fontSize: "clamp(10px,2.5vw,12px)", textAlign: "center" }}>
                  From here you can choose:
                </div>
                <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.88)", fontSize: "clamp(11px,2.8vw,13px)", fontWeight: 700, lineHeight: 1.65, textAlign: "center" }}>
                  1) Subtractive (notch) therapy.<br />
                  2) Additive (peaking) therapy.
                </div>
                <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.48)", fontSize: "clamp(9.5px,2.4vw,11.5px)", lineHeight: 1.5, textAlign: "center" }}>
                  Both have shown positive results<br />in reducing, or in some cases curing tinnitus.
                </div>
                <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(10px,2.5vw,12px)", lineHeight: 1.5, textAlign: "center" }}>
                  The earvana app can help you explore<br />both of these experimental therapies.
                </div>
                <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.28)", fontSize: "clamp(8.5px,2.1vw,10px)", lineHeight: 1.5, textAlign: "center" }}>
                  NOTE:  As of May 2026, neither of these therapies are<br />medically conclusive.  This feature is provided for your<br />own personal experimentation.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8, flexShrink: 0 }}>
                <button onClick={handleBoost} style={{
                  flex: 1, height: 36, borderRadius: 8,
                  background: "rgba(0,180,80,0.18)", border: "1px solid rgba(0,220,80,0.45)",
                  ...KALLISTO, fontWeight: 700, fontSize: "clamp(9px,2.3vw,11px)",
                  color: "#00ee88", cursor: "pointer", letterSpacing: "0.03em",
                }}>∧ boost {fmtSub(processCandidate)}</button>

                <button onClick={handleNotch} style={{
                  flex: 1, height: 36, borderRadius: 8,
                  background: "rgba(0,110,210,0.18)", border: "1px solid rgba(0,150,255,0.45)",
                  ...KALLISTO, fontWeight: 700, fontSize: "clamp(9px,2.3vw,11px)",
                  color: "#00ccff", cursor: "pointer", letterSpacing: "0.03em",
                }}>∨ notch {fmtSub(processCandidate)}</button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          DONE card  (p4)
      ════════════════════════════════════════════════════════════════════════ */}
      {doneAction !== null && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "absolute", inset: 0, zIndex: 85,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 clamp(12px,3cqw,20px)",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.68)" }} />

          <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 310 }}>
            <img src={diagCardImg} alt="" draggable={false}
              style={{ display: "block", width: "100%", height: "auto",
                       filter: "drop-shadow(0 14px 48px rgba(0,0,0,0.90))" }} />

            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "clamp(16px,4.5svh,24px) 20px clamp(14px,4svh,20px)",
            }}>

              <button onClick={handleDoneClose} style={{
                position: "absolute", top: 8, left: 8,
                width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                background: "none", border: "none", cursor: "pointer",
                ...KALLISTO, fontSize: "1.25rem", color: "rgba(255,255,255,0.62)",
              }}>✕</button>

              <div style={{ textAlign: "center" }}>
                <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(20px,5vw,24px)", fontWeight: 700, marginBottom: 12 }}>
                  Done!
                </div>
                <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(11px,2.8vw,13px)", lineHeight: 1.6 }}>
                  The narrow-band frequency of
                </div>
                <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.92)", fontSize: "clamp(18px,4.6vw,22px)", fontWeight: 700, lineHeight: 1.2, margin: "4px 0" }}>
                  {fmtSub(doneAction.freq)}
                </div>
                <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(11px,2.8vw,13px)", lineHeight: 1.6 }}>
                  {doneAction.type === "notch"
                    ? "has been notched out of the earvana audio mix."
                    : "has been boosted in the earvana audio mix."}
                </div>
                <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.55)", fontSize: "clamp(10px,2.5vw,12px)", lineHeight: 1.55, marginTop: 12 }}>
                  You can reset at any time<br />by coming back to the<br />diagnostic section.
                </div>
                <button
                  onPointerDown={() => setBackPressed(true)}
                  onPointerUp={() => setBackPressed(false)}
                  onPointerLeave={() => setBackPressed(false)}
                  onClick={handleBackFromDone}
                  style={{
                    marginTop: 16, background: "none", border: "none", cursor: "pointer",
                    ...KALLISTO, fontWeight: 700, fontSize: "clamp(11px,2.7vw,13px)",
                    color: backPressed ? "#ffe880" : "#b89a2a",
                    letterSpacing: "0.04em",
                    textShadow: backPressed ? "0 0 8px #ffd040" : "none",
                    transition: "color 0.08s, text-shadow 0.08s",
                  }}>«« back</button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
