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

// ─── LED volume slider ─────────────────────────────────────────────────────────

const LED_DOTS      = 12;
const TONE_MAX_GAIN = 0.38;

function ledGain(level: number) { return (level / LED_DOTS) * TONE_MAX_GAIN; }

function LedSlider({ level, onChange }: { level: number; onChange: (l: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hitTest = useCallback((clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const { top, height } = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientY - top) / height));
    onChange(Math.max(1, Math.round((1 - pct) * LED_DOTS)));
  }, [onChange]);
  return (
    <div ref={trackRef}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); hitTest(e.clientY); }}
      onPointerMove={e => { if (e.buttons === 1) hitTest(e.clientY); }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", gap: 3,
        cursor: "pointer", touchAction: "none", userSelect: "none",
        height: "100%",
      }}>
      {Array.from({ length: LED_DOTS }, (_, i) => {
        const lit = (LED_DOTS - 1 - i) < level;
        return (
          <div key={i} style={{
            width: 11, height: 11, borderRadius: "50%", flexShrink: 0,
            background: lit ? "#00ff55" : "rgba(255,255,255,0.14)",
            boxShadow: lit ? "0 0 5px #00ff55" : "none",
            transition: "background 0.1s, box-shadow 0.1s",
          }} />
        );
      })}
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

// Chevron — 50% larger than original 15px → 22px
function Chevron({ expanded }: { expanded: boolean }) {
  return expanded
    ? (
      <svg width={22} height={22} viewBox="0 0 20 20" style={{ flexShrink: 0, display: "block" }}>
        <polygon points="2,4 18,4 10,17" fill="#b8d730" />
      </svg>
    ) : (
      <svg width={22} height={22} viewBox="0 0 20 20" style={{ flexShrink: 0, display: "block" }}>
        <polygon points="3,2 18,10 3,18" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
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
  const [notchCandidate, setNotchCandidate]  = useState<number | null>(null);
  const [toneLevel,      setToneLevel]       = useState(3);
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

  useEffect(() => { if (gRef.current) gRef.current.gain.value = ledGain(toneLevel); }, [toneLevel]);
  useEffect(() => () => { killOsc(); ctxRef.current?.close().catch(() => {}); }, [killOsc]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleTriangle = useCallback((freq: number) => {
    if (playingFreq === freq) stopTone();
    else playTone(freq, ledGain(toneLevel));
  }, [playingFreq, playTone, stopTone, toneLevel]);

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
          0%   { transform: scale(0);    opacity: 0; }
          72%  { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
      `}</style>

      {/* Full-screen blurred background */}
      <img src={img("homepage_BLUR.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* ── Panel container ─────────────────────────────────────────────────
          overflow:hidden clips the off-screen carousel page.
          animation: scale-up on mount with exponential-out spring curve.     */}
      <div style={{
        position: "absolute",
        top:    "clamp(50px,8vh,72px)",
        left:   "clamp(24px,5.5cqw,36px)",
        right:  "clamp(24px,5.5cqw,36px)",
        bottom: "clamp(50px,7vh,72px)",
        overflow: "hidden",
        boxShadow: "0 12px 48px rgba(0,0,0,0.70)",
        animation: "diagScaleIn 0.44s cubic-bezier(0.16,1,0.3,1) both",
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

              return (
                <div key={band.label}>

                  {/* Parent row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                    <button onClick={() => handleChevron(band.label)} style={{
                      flexShrink: 0, width: 30, height: 30,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Chevron expanded={isExpanded} />
                    </button>

                    <button onClick={() => handleTriangle(band.base)}
                      style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                      {playingFreq === band.base
                        ? <TriFilled color="#00ff55" size={16} />
                        : <TriOutline size={16} />}
                      <span style={{
                        ...KALLISTO,
                        fontSize: "clamp(13px,3.2cqw,16px)",
                        fontWeight: playingFreq === band.base ? 700 : 300,
                        color: playingFreq === band.base ? "#00ff55" : "rgba(255,255,255,0.75)",
                      }}>{band.label}</span>
                    </button>
                  </div>

                  {/* Sub-bands accordion */}
                  <div style={{
                    maxHeight: isExpanded ? `${subs.length * 34}px` : "0px",
                    overflow: "hidden",
                    transition: "max-height 0.28s ease",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingBottom: 4 }}>
                      {subs.map(sf => {
                        const sfPlaying = playingFreq === sf;
                        const sfNotched = currentNotch === sf;
                        return (
                          <div key={sf} style={{
                            display: "flex", alignItems: "center",
                            borderRadius: sfNotched ? 5 : 0,
                            background: sfNotched ? "rgba(184,154,42,0.18)" : "transparent",
                            padding: "2px 4px 2px 38px",
                          }}>
                            <span style={{
                              ...KALLISTO, fontSize: "clamp(7.5px,1.85cqw,10px)",
                              fontWeight: 300, color: "#b89a2a",
                              marginRight: sfNotched ? 4 : 0,
                              visibility: sfNotched ? "visible" : "hidden",
                              width: sfNotched ? "auto" : 0,
                              overflow: "hidden", flexShrink: 0,
                            }}>( notched )</span>

                            <button onClick={() => handleTriangle(sf)}
                              style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {sfPlaying ? <TriFilled color="#00ff55" size={13} /> : <TriOutline size={13} />}
                              <span style={{
                                ...KALLISTO,
                                fontSize: "clamp(11px,2.7cqw,14px)",
                                fontWeight: sfPlaying ? 700 : 300,
                                color: sfPlaying ? "#00ff55" : sfNotched ? "#c8a832" : "rgba(255,255,255,0.65)",
                              }}>{fmtSub(sf)}</span>
                            </button>

                            <div style={{ marginLeft: "auto", paddingLeft: 8, flexShrink: 0 }}>
                              {sfNotched ? (
                                <button onClick={() => onNotch(null)} style={{
                                  display: "flex", alignItems: "center", gap: 3,
                                  ...KALLISTO, fontWeight: 700,
                                  fontSize: "clamp(8px,2cqw,11px)", color: "#b89a2a",
                                }}>reset <TriFilled color="#b89a2a" size={10} /></button>
                              ) : (
                                <button onClick={() => sfPlaying && setNotchCandidate(sf)} style={{
                                  display: "flex", alignItems: "center", gap: 3,
                                  visibility: sfPlaying ? "visible" : "hidden",
                                  ...KALLISTO, fontWeight: 700,
                                  fontSize: "clamp(8px,2cqw,11px)", color: "#ffcc00",
                                }}>NOTCH <TriFilled color="#ffcc00" size={10} /></button>
                              )}
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

          {/* LED tone volume — right column */}
          <div style={{
            position: "absolute",
            top: "24%", bottom: "12%",
            right: 4, width: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "8px 0",
          }}>
            <LedSlider level={toneLevel} onChange={setToneLevel} />
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
      </div>

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
