import { useState, useRef, useEffect, useCallback } from "react";

const BASE = import.meta.env.BASE_URL;
const img  = (name: string) => `${BASE}${name}`;

const KALLISTO: React.CSSProperties = { fontFamily: "'Kallisto', sans-serif" };

const WIPE_MS = 340;

// ─── Frequency bands ──────────────────────────────────────────────────────────

const BANDS = [
  { label: "upper-bass",    base: 500,  step:  50, count:  5 },
  { label: "lower-mid",     base: 750,  step:  50, count:  5 },
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
  const k = hz / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)} khz`;
}

// ─── Diagnostic tone volume — mirrors home-page VolumeMeter ──────────────────

const TONE_MAX_GAIN = 0.38;

// volume is 0-1; gain = volume * TONE_MAX_GAIN
function volToGain(v: number) { return v * TONE_MAX_GAIN; }

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
    dragging.current = true;
    setPressed(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    hit(e.clientY);
  }, [hit]);
  const onPM = useCallback((e: React.PointerEvent) => { if (dragging.current) hit(e.clientY); }, [hit]);
  const onPU = useCallback(() => { dragging.current = false; setPressed(false); }, []);

  return (
    <div ref={ref}
      style={{ position: "relative", height: "clamp(130px,22svh,200px)",
               cursor: "pointer", touchAction: "none", userSelect: "none", flexShrink: 0,
               opacity: pressed ? 1 : 0.5,
               transition: "opacity 0.15s ease" }}
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

// ─── SVG triangles ────────────────────────────────────────────────────────────

function TriOutline({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ flexShrink: 0, display: "block" }}>
      <polygon points="3,2 18,10 3,18" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
    </svg>
  );
}
function TriFilled({ color = "#00ff55", size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ flexShrink: 0, display: "block" }}>
      <polygon points="3,2 18,10 3,18" fill={color} />
    </svg>
  );
}

// Chevron — thin stroked polyline; blinking=true when parent clicked but not yet expanded
function Chevron({ expanded, blinking = false }: { expanded: boolean; blinking?: boolean }) {
  return (
    <svg width={14} height={9} viewBox="0 0 20 20"
      style={{ flexShrink: 0, display: "block",
               animation: blinking ? "chevronBlink 0.55s ease-in-out infinite" : "none" }}>
      {expanded
        // ∨ down-pointing, solid yellow
        ? <polyline points="3,6 10,14 17,6"
            fill="none" stroke="#ffcc00" strokeWidth="2.8"
            strokeLinecap="round" strokeLinejoin="round" />
        // › right-pointing; yellow when blinking, dim white otherwise
        : <polyline points="6,3 14,10 6,17"
            fill="none" stroke={blinking ? "#ffcc00" : "rgba(255,255,255,0.55)"} strokeWidth="2.8"
            strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onClose:      () => void;
  onNotch:      (freq: number | null) => void;
  currentNotch: number | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiagnosticsPanel({ onClose, onNotch, currentNotch }: Props) {
  const [page,           setPage]           = useState<1 | 2>(1);
  const [playingFreq,    setPlayingFreq]     = useState<number | null>(null);
  const [expandedBand,   setExpandedBand]    = useState<string | null>(null);
  const [focusedBand,    setFocusedBand]     = useState<string | null>(null);
  const [notchCandidate, setNotchCandidate]  = useState<number | null>(null);
  const [toneVolume,     setToneVolume]      = useState(0.25);   // 0-1
  const [confirmPress,   setConfirmPress]    = useState(false);

  // onClick-state for wipe-trigger buttons
  const [startPressed, setStartPressed] = useState(false);
  const [backPressed,  setBackPressed]  = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gRef   = useRef<GainNode | null>(null);

  // ── Tone engine ───────────────────────────────────────────────────────────

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

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleTriangle = useCallback((freq: number) => {
    if (playingFreq === freq) stopTone();
    else playTone(freq, volToGain(toneVolume));
  }, [playingFreq, playTone, stopTone, toneVolume]);

  // Parent-row play: collapses other accordions + marks this band focused (chevron blinks)
  const handleParentPlay = useCallback((freq: number, bandLabel: string) => {
    setExpandedBand(prev => (prev !== null && prev !== bandLabel) ? null : prev);
    setFocusedBand(bandLabel);
    if (playingFreq === freq) stopTone();
    else playTone(freq, volToGain(toneVolume));
  }, [playingFreq, playTone, stopTone, toneVolume]);

  const handleChevron = useCallback((label: string) => {
    stopTone();
    setExpandedBand(prev => prev === label ? null : label);
  }, [stopTone]);

  const handleNotchConfirm = () => {
    if (notchCandidate !== null) {
      onNotch(notchCandidate); setNotchCandidate(null); stopTone(); onClose();
    }
  };

  const handleClose = () => { stopTone(); onClose(); };

  const handleStartTest = () => { setPage(2); };

  const handleBack = () => {
    stopTone();
    setPage(1);
    setExpandedBand(null);
    setFocusedBand(null);
  };

  // ── Carousel translateX values ────────────────────────────────────────────
  // P1: 0% when active, -100% when p2 is active (slides left)
  // P2: 100% when inactive (waits right), 0% when active (slides in)
  const p1X = page === 1 ? "0%"    : "-100%";
  const p2X = page === 2 ? "0%"    : "100%";
  const wipeTx = `transform ${WIPE_MS}ms cubic-bezier(0.25,0.46,0.45,0.94)`;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-50">

      {/* Injected keyframes — rendered once into DOM */}
      <style>{`
        @keyframes diagScaleIn {
          0%   { transform: scale(0.05); opacity: 0; }
          60%  { opacity: 1; }
          85%  { transform: scale(1.03); }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes chevronBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.1; }
        }
      `}</style>

      {/* Full-screen blurred background */}
      <img src={img("homepage_BLUR.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* ── Shadow wrapper ───────────────────────────────────────────────────
          filter:drop-shadow traces the inner's clipped painted shape
          (a rounded rectangle), so the shadow hugs the PNG's corners.
          animation:scaleIn lives here so the shadow scales with the card. */}
      <div style={{
        position: "absolute",
        top:    "clamp(50px,8vh,72px)",
        left:   "clamp(24px,5.5cqw,36px)",
        right:  "clamp(24px,5.5cqw,36px)",
        bottom: "clamp(50px,7vh,72px)",
        filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.75))",
        animation: "diagScaleIn 0.72s cubic-bezier(0.25,0.7,0.4,1) both",
      }}>
      {/* ── Carousel container ───────────────────────────────────────────────
          clip-path rounds the clipped area to match PNG corner radius (~22px).
          overflow:hidden clips the off-screen carousel page within that shape. */}
      <div style={{
        position: "absolute", inset: 0,
        overflow: "hidden",
        clipPath: "inset(0 round 22px)",
      }}>

        {/* X — always visible above carousel */}
        <button onClick={handleClose} aria-label="Close" style={{
          position: "absolute", top: 0, left: 0, zIndex: 20,
          width: 48, height: 48,
          display: "flex", alignItems: "center", justifyContent: "center",
          ...KALLISTO, fontWeight: 500, fontSize: "1.55rem", lineHeight: 1,
          color: "rgba(255,255,255,0.85)",
        }}>✕</button>

        {/* ══════════════════════════════════════════════════════════════════
            PAGE 1 — Intro (slides out left on → P2)
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{
          position: "absolute", inset: 0,
          transform: `translateX(${p1X})`,
          transition: wipeTx,
          willChange: "transform",
        }}>
          <img src={img("diag_pane1+txt.png")} alt=""
            style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
            draggable={false} />

          {/* START TEST — overlaid in code */}
          <button
            onPointerDown={() => setStartPressed(true)}
            onPointerUp={() => setStartPressed(false)}
            onPointerLeave={() => setStartPressed(false)}
            onClick={handleStartTest}
            style={{
              position: "absolute", bottom: "6%", left: "50%",
              transform: "translateX(-50%)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              zIndex: 10,
              ...KALLISTO, fontWeight: 700, letterSpacing: "0.12em",
              // onClick glow state: brighter lime + radiating text-shadow
              color: startPressed ? "#e8ff80" : "#7dc93a",
              textShadow: startPressed
                ? "0 0 8px #b8ff40, 0 0 20px #90e020, 0 0 40px #60c000"
                : "none",
              transition: "color 0.08s, text-shadow 0.08s",
            }}>
            <span style={{ fontSize: "clamp(12px,3cqw,15px)" }}>START TEST</span>
            {/* Chevron — 50% bigger than the previous 15px */}
            <svg width={22} height={22} viewBox="0 0 20 20"
              style={{ marginTop: 1 }}>
              <polygon points="2,4 18,4 10,17"
                fill={startPressed ? "#e8ff80" : "#7dc93a"}
                style={{ filter: startPressed ? "drop-shadow(0 0 4px #a0e030)" : "none" }} />
            </svg>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PAGE 2 — Frequency list (enters from right on P1 → )
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{
          position: "absolute", inset: 0,
          transform: `translateX(${p2X})`,
          transition: wipeTx,
          willChange: "transform",
        }}>
          <img src={img("diag_pane2+txt.png")} alt=""
            style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
            draggable={false} />

          {/* Scrollable frequency list — between burned-in dividers */}
          <div style={{
            position: "absolute",
            top: "24%", bottom: "12%",
            left: 0, right: 36,
            overflowY: "auto",
            scrollbarWidth: "none",
            padding: "4px 8px 4px 14px",
          }}>
            {BANDS.map(band => {
              const subs       = getSubBands(band);
              const isExpanded = expandedBand === band.label;
              const bPlaying   = playingFreq === band.base;

              return (
                <div key={band.label}>

                  {/* ── Parent row — split so ~3rd letter lands at centre ── */}
                  <div style={{ display: "flex", alignItems: "center", padding: "5px 0" }}>

                    {/* LEFT 44% — icons right-justified to the split line */}
                    <div style={{ flexBasis: "44%", flexShrink: 0, display: "flex",
                                  alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                      <button onClick={() => handleChevron(band.label)} style={{
                        width: 26, height: 26,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Chevron expanded={isExpanded} blinking={!isExpanded && focusedBand === band.label} />
                      </button>
                      <button onClick={() => handleParentPlay(band.base, band.label)}
                        style={{ display: "flex", alignItems: "center" }}>
                        {isExpanded
                          // expanded → down-pointing green triangle
                          ? <div style={{ transform: "rotate(90deg)", display: "flex" }}>
                              <TriFilled color="#00ff55" size={14} />
                            </div>
                          : bPlaying
                          ? <TriFilled color="#00ff55" size={14} />
                          : <TriOutline size={14} />}
                      </button>
                    </div>

                    {/* RIGHT 56% — label left-aligned from split line */}
                    <button onClick={() => handleParentPlay(band.base, band.label)}
                      style={{ flex: 1, display: "flex", alignItems: "center",
                               paddingLeft: 6 }}>
                      <span style={{
                        ...KALLISTO,
                        fontSize: "clamp(13px,3.2cqw,16px)",
                        fontWeight: (bPlaying || isExpanded) ? 700 : 300,
                        color: (bPlaying || isExpanded) ? "#00ff55" : "rgba(255,255,255,0.75)",
                      }}>{band.label}</span>
                    </button>

                  </div>

                  {/* ── Sub-bands accordion — indented right ── */}
                  <div style={{
                    maxHeight: isExpanded ? `${subs.length * 34}px` : "0px",
                    overflow: "hidden",
                    transition: "max-height 0.28s ease",
                    paddingLeft: "16%",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingBottom: 4 }}>
                      {subs.map(sf => {
                        const sfPlaying = playingFreq === sf;
                        const sfNotched = currentNotch === sf;
                        return (
                          <div key={sf} style={{
                            display: "flex", alignItems: "center", lineHeight: 1,
                            borderRadius: sfNotched ? 5 : 0,
                            background: sfNotched ? "rgba(184,154,42,0.18)" : "transparent",
                            padding: "2px 0",
                          }}>

                            {/* LEFT 44% — play triangle right-justified to split */}
                            <div style={{ flexBasis: "44%", flexShrink: 0, display: "flex",
                                          alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                              {sfNotched && (
                                <span style={{
                                  ...KALLISTO, fontSize: "clamp(7px,1.7cqw,9px)",
                                  fontWeight: 300, color: "#b89a2a",
                                }}>( notched )</span>
                              )}
                              <button onClick={() => handleTriangle(sf)}
                                style={{ display: "flex", alignItems: "center" }}>
                                {sfPlaying
                                  ? <TriFilled color="#00ff55" size={12} />
                                  : <TriOutline size={12} />}
                              </button>
                            </div>

                            {/* RIGHT 56% — frequency text + notch at far right */}
                            <div style={{ flex: 1, display: "flex", alignItems: "center",
                                          paddingLeft: 6 }}>
                              <button onClick={() => handleTriangle(sf)}
                                style={{ display: "flex", alignItems: "center", lineHeight: 1 }}>
                                <span style={{
                                  ...KALLISTO,
                                  fontSize: "clamp(11px,2.7cqw,14px)",
                                  fontWeight: sfPlaying ? 700 : 300,
                                  color: sfPlaying ? "#00ff55" : sfNotched ? "#c8a832" : "rgba(255,255,255,0.65)",
                                }}>{fmtSub(sf)}</span>
                              </button>
                              <div style={{ marginLeft: 32, flexShrink: 0,
                                            display: "flex", alignItems: "center" }}>
                                {sfNotched ? (
                                  <button onClick={() => onNotch(null)} style={{
                                    display: "flex", alignItems: "center", gap: 3,
                                    lineHeight: 1,
                                    ...KALLISTO, fontWeight: 700,
                                    fontSize: "clamp(7.5px,1.85cqw,10px)", color: "#b89a2a",
                                  }}>reset <TriFilled color="#b89a2a" size={9} /></button>
                                ) : (
                                  <button onClick={() => { if (sfPlaying) { stopTone(); setNotchCandidate(sf); } }} style={{
                                    display: "flex", alignItems: "center", gap: 3,
                                    lineHeight: 1,
                                    visibility: sfPlaying ? "visible" : "hidden",
                                    ...KALLISTO, fontWeight: 700,
                                    fontSize: "clamp(7.5px,1.85cqw,10px)", color: "#ffcc00",
                                  }}>NOTCH <TriFilled color="#ffcc00" size={9} /></button>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Tone volume — right column, same asset + reveal as home-page meter */}
          <div style={{
            position: "absolute",
            top: "24%", bottom: "12%",
            right: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <DiagVolMeter volume={toneVolume} onChange={setToneVolume} />
          </div>

          {/* Back button — below bottom divider */}
          <button
            onPointerDown={() => setBackPressed(true)}
            onPointerUp={() => setBackPressed(false)}
            onPointerLeave={() => setBackPressed(false)}
            onClick={handleBack}
            style={{
              position: "absolute", bottom: "3%", left: 14, zIndex: 10,
              ...KALLISTO, fontWeight: 700,
              fontSize: "clamp(11px,2.7cqw,13px)",
              letterSpacing: "0.04em",
              color: backPressed ? "#ffe880" : "#b89a2a",
              textShadow: backPressed
                ? "0 0 8px #ffd040, 0 0 20px #c09010, 0 0 40px #806000"
                : "none",
              transition: "color 0.08s, text-shadow 0.08s",
            }}>«« back</button>

        </div>
      </div>{/* end carousel container */}
      </div>{/* end shadow wrapper */}

      {/* ── NOTCH confirmation dialog ── */}
      {notchCandidate !== null && (() => {
        const label = fmtSub(notchCandidate);
        return (
          <div style={{
            position: "absolute", inset: 0, zIndex: 60,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 clamp(10px,2.5cqw,18px)",
          }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
              onClick={() => setNotchCandidate(null)} />
            <div style={{
              position: "relative", zIndex: 10,
              background: "rgba(50,58,45,0.96)",
              border: "1px solid rgba(184,154,42,0.45)",
              borderRadius: 14,
              boxShadow: "0 8px 36px rgba(0,0,0,0.7)",
              padding: "22px 20px 16px",
              width: "100%", maxWidth: 340,
              textAlign: "center", ...KALLISTO,
            }}>
              <p style={{ fontWeight: 500, fontSize: "clamp(12px,3cqw,15px)", color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
                "notching" any frequency is optional:
              </p>
              {([
                { w: 300, txt: "recent studies show this technique may help train the brain to suppress the internal ringing." },
                { w: 700, txt: "this is not a guaranteed fix. results vary among users." },
                { w: 300, txt: "this frequency will be remembered and notched from your audio playback. you can reset at any time." },
              ] as const).map(({ w, txt }, i) => (
                <p key={i} style={{
                  fontWeight: w, lineHeight: 1.45, marginBottom: 10,
                  fontSize: w === 700 ? "clamp(11px,2.7cqw,14px)" : "clamp(10px,2.4cqw,12px)",
                  color: w === 700 ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.65)",
                }}>{txt}</p>
              ))}
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button onClick={() => setNotchCandidate(null)} style={{
                  flex: 1, height: 40, borderRadius: 8,
                  background: "rgba(90,90,90,0.65)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  ...KALLISTO, fontWeight: 300, fontSize: "clamp(11px,2.7cqw,13px)",
                  color: "rgba(255,255,255,0.70)",
                }}>cancel</button>
                <button
                  onClick={handleNotchConfirm}
                  onPointerDown={() => setConfirmPress(true)}
                  onPointerUp={() => setConfirmPress(false)}
                  onPointerLeave={() => setConfirmPress(false)}
                  style={{
                    flex: 1.6, height: 40, borderRadius: 8,
                    background: confirmPress ? "rgba(0,180,60,0.55)" : "rgba(30,30,30,0.85)",
                    border: "1px solid rgba(0,255,85,0.35)",
                    transition: "background 0.12s",
                    ...KALLISTO, fontWeight: 700, fontSize: "clamp(11px,2.7cqw,13px)",
                    color: "#00ff55",
                  }}>✓ notch {label}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
