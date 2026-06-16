import { useState, useRef, useEffect, useCallback } from "react";

const BASE = import.meta.env.BASE_URL;
const img  = (name: string) => `${BASE}${name}`;

const KALLISTO: React.CSSProperties = { fontFamily: "'Kallisto', sans-serif" };

// ─── Frequency bands — from DiagFreqBreakdown2.rtf ────────────────────────────
// upper-bass  500-700   (50 Hz steps, 5 sub-bands)
// lower-mid   750-950   (50 Hz steps, 5 sub-bands)
// midrange    1.0k-1.9k (100 Hz steps, 10 sub-bands)
// upper-mid   2.0k-2.9k
// bright-mid  3.0k-3.9k
// lower-treble 4.0k-4.9k
// mid-treble  5.0k-5.9k
// upper-treble 6.0k-6.9k
// high-treble 7.0k-7.9k
// sizzle-treble 8.0k-8.9k

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

const LED_DOTS     = 12;
const TONE_MAX_GAIN = 0.38;

function ledGain(level: number): number {
  return (level / LED_DOTS) * TONE_MAX_GAIN;
}

function LedSlider({ level, onChange }: { level: number; onChange: (l: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const hitTest = useCallback((clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const { top, height } = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientY - top) / height));
    onChange(Math.max(1, Math.round((1 - pct) * LED_DOTS)));
  }, [onChange]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    hitTest(e.clientY);
  }, [hitTest]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    hitTest(e.clientY);
  }, [hitTest]);

  return (
    <div ref={trackRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", gap: 3,
        cursor: "pointer", touchAction: "none", userSelect: "none",
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

// ─── Yellow divider image ─────────────────────────────────────────────────────

function YellowDivider() {
  return (
    <div style={{ width: "100%", padding: "0 6px", flexShrink: 0 }}>
      <img src={img("yellow_divider.png")} alt=""
        style={{ width: "100%", height: "auto", display: "block" }}
        draggable={false} />
    </div>
  );
}

// ─── SVG triangles ───────────────────────────────────────────────────────────

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

// chevron: ▼ pointing down when expanded, ▷ outline when collapsed
function Chevron({ expanded }: { expanded: boolean }) {
  return expanded
    ? (
      <svg width={16} height={16} viewBox="0 0 20 20" style={{ flexShrink: 0, display: "block" }}>
        <polygon points="2,4 18,4 10,17" fill="#b8d730" />
      </svg>
    ) : (
      <svg width={16} height={16} viewBox="0 0 20 20" style={{ flexShrink: 0, display: "block" }}>
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
  const [toneLevel,      setToneLevel]       = useState<number>(3);
  const [confirmPress,   setConfirmPress]    = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gRef   = useRef<GainNode | null>(null);

  // ── Tone engine ───────────────────────────────────────────────────────────

  const killOsc = useCallback(() => {
    if (oscRef.current) { try { oscRef.current.stop(); } catch { /**/ } oscRef.current.disconnect(); oscRef.current = null; }
    if (gRef.current)   { try { gRef.current.disconnect(); } catch { /**/ } gRef.current = null; }
  }, []);

  const playTone = useCallback((freq: number, gainValue: number) => {
    killOsc();
    if (!ctxRef.current) {
      const Ctx = ((window as unknown) as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? window.AudioContext;
      ctxRef.current = new Ctx();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type            = "sine";
    osc.frequency.value = freq;
    g.gain.value        = gainValue;
    osc.connect(g); g.connect(ctx.destination); osc.start();
    oscRef.current = osc;
    gRef.current   = g;
    setPlayingFreq(freq);
  }, [killOsc]);

  const stopTone = useCallback(() => { killOsc(); setPlayingFreq(null); }, [killOsc]);

  // Live gain update when slider moves while tone is playing
  useEffect(() => { if (gRef.current) gRef.current.gain.value = ledGain(toneLevel); }, [toneLevel]);

  useEffect(() => () => { killOsc(); ctxRef.current?.close().catch(() => {}); }, [killOsc]);

  // ── Handlers ──────────────────────────────────────────────────────────────

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
      onNotch(notchCandidate);
      setNotchCandidate(null);
      stopTone();
      onClose();
    }
  };

  const handleClose = () => { stopTone(); onClose(); };
  const handleBack  = () => { stopTone(); setPage(1); setExpandedBand(null); };

  // ─── Shared card wrapper ──────────────────────────────────────────────────

  // The X button and panel card are shared by both pages.
  return (
    <div className="absolute inset-0 z-50">

      {/* Blurred screen bg */}
      <img src={img("homepage_BLUR.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* Panel container */}
      <div style={{
        position: "absolute",
        top:    "clamp(18px,3vh,28px)",
        left:   "clamp(8px,2cqw,14px)",
        right:  "clamp(8px,2cqw,14px)",
        bottom: "clamp(10px,2vh,20px)",
        display: "flex", flexDirection: "column",
      }}>

        {/* X — top-left corner of panel container */}
        <button onClick={handleClose} aria-label="Close" style={{
          position: "absolute", top: 0, left: 0, zIndex: 20,
          width: 48, height: 48,
          display: "flex", alignItems: "center", justifyContent: "center",
          ...KALLISTO, fontWeight: 500, fontSize: "1.55rem", lineHeight: 1,
          color: "rgba(255,255,255,0.85)",
        }}>✕</button>

        {/* Card with drop shadow */}
        <div style={{
          flex: 1, position: "relative", display: "flex", flexDirection: "column",
          overflow: "hidden", borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.72), 0 2px 12px rgba(0,0,0,0.5)",
        }}>

          {/* ═══════════ PAGE 1 — Intro ═══════════════════════════════════ */}
          {page === 1 && (
            <>
              {/* diag_pane1+txt.png fills the card — instructions are burned in */}
              <img src={img("diag_pane1+txt.png")} alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }}
                draggable={false} />

              {/* START TEST button — code-rendered, pinned to bottom */}
              <button
                onClick={() => setPage(2)}
                style={{
                  position: "absolute", bottom: "6%", left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  zIndex: 10,
                  ...KALLISTO, fontWeight: 700, letterSpacing: "0.12em", color: "#7dc93a",
                }}>
                <span style={{ fontSize: "clamp(12px,3cqw,15px)" }}>START TEST</span>
                <span style={{ fontSize: "clamp(14px,3.5cqw,18px)", lineHeight: 1 }}>»</span>
              </button>
            </>
          )}

          {/* ═══════════ PAGE 2 — Frequency list ═══════════════════════════ */}
          {page === 2 && (
            <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Pane background — diag_bgpane1 (no shadow baked in; we add it in code above) */}
              <img src={img("diag_bgpane1.png")} alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }}
                draggable={false} />

              {/* Content over pane bg */}
              <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

                {/* Header rendered in code on top of bgpane1 */}
                <div style={{ textAlign: "center", paddingTop: 22, paddingBottom: 6, paddingLeft: 18, paddingRight: 18, flexShrink: 0 }}>
                  <div style={{ ...KALLISTO, fontSize: "clamp(17px,4.2cqw,22px)", fontWeight: 700, color: "rgba(255,255,255,0.9)", letterSpacing: "0.06em" }}>
                    ~ Diagnostics ~
                  </div>
                  <div style={{ ...KALLISTO, fontSize: "clamp(7.5px,1.85cqw,10px)", fontWeight: 300, color: "rgba(255,255,255,0.45)", marginTop: 3, lineHeight: 1.35 }}>
                    (Important: this should not be used as a<br />substitute for professional medical diagnosis)
                  </div>
                </div>

                {/* Top yellow divider */}
                <div style={{ paddingTop: 2, paddingBottom: 2, flexShrink: 0 }}>
                  <YellowDivider />
                </div>

                {/* Main row: list + LED slider */}
                <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

                  {/* Scrollable frequency list */}
                  <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "6px 8px 6px 16px" }}>
                    {BANDS.map(band => {
                      const subs       = getSubBands(band);
                      const isExpanded = expandedBand === band.label;

                      return (
                        <div key={band.label}>

                          {/* Parent row */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>

                            <button onClick={() => handleChevron(band.label)} style={{
                              flexShrink: 0, width: 26, height: 26,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <Chevron expanded={isExpanded} />
                            </button>

                            <button onClick={() => handleTriangle(band.base)} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                              {playingFreq === band.base
                                ? <TriFilled color="#00ff55" size={16} />
                                : <TriOutline size={16} />}
                              <span style={{
                                ...KALLISTO,
                                fontSize: "clamp(13px,3.2cqw,16px)",
                                fontWeight: playingFreq === band.base ? 700 : 300,
                                color: playingFreq === band.base ? "#00ff55" : "rgba(255,255,255,0.72)",
                              }}>{band.label}</span>
                            </button>

                          </div>

                          {/* Sub-bands — animated accordion */}
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

                                    {/* (notched) label — space always reserved */}
                                    <span style={{
                                      ...KALLISTO, fontSize: "clamp(7.5px,1.85cqw,10px)",
                                      fontWeight: 300, color: "#b89a2a",
                                      marginRight: sfNotched ? 4 : 0,
                                      visibility: sfNotched ? "visible" : "hidden",
                                      whiteSpace: "nowrap",
                                      minWidth: sfNotched ? undefined : 0,
                                      width: sfNotched ? "auto" : 0,
                                      overflow: "hidden",
                                      flexShrink: 0,
                                    }}>( notched )</span>

                                    {/* Play */}
                                    <button onClick={() => handleTriangle(sf)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      {sfPlaying ? <TriFilled color="#00ff55" size={13} /> : <TriOutline size={13} />}
                                      <span style={{
                                        ...KALLISTO,
                                        fontSize: "clamp(11px,2.7cqw,14px)",
                                        fontWeight: sfPlaying ? 700 : 300,
                                        color: sfPlaying ? "#00ff55" : sfNotched ? "#c8a832" : "rgba(255,255,255,0.62)",
                                      }}>{fmtSub(sf)}</span>
                                    </button>

                                    {/* NOTCH / RESET — always reserves space */}
                                    <div style={{ marginLeft: "auto", paddingLeft: 8, flexShrink: 0 }}>
                                      {sfNotched ? (
                                        <button onClick={() => onNotch(null)} style={{
                                          display: "flex", alignItems: "center", gap: 3,
                                          ...KALLISTO, fontWeight: 700,
                                          fontSize: "clamp(8px,2cqw,11px)", color: "#b89a2a",
                                        }}>
                                          reset <TriFilled color="#b89a2a" size={10} />
                                        </button>
                                      ) : (
                                        <button onClick={() => sfPlaying && setNotchCandidate(sf)} style={{
                                          display: "flex", alignItems: "center", gap: 3,
                                          visibility: sfPlaying ? "visible" : "hidden",
                                          ...KALLISTO, fontWeight: 700,
                                          fontSize: "clamp(8px,2cqw,11px)", color: "#ffcc00",
                                        }}>
                                          NOTCH <TriFilled color="#ffcc00" size={10} />
                                        </button>
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
                    width: 36, flexShrink: 0,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    padding: "8px 0",
                  }}>
                    <LedSlider level={toneLevel} onChange={setToneLevel} />
                  </div>

                </div>

                {/* Bottom yellow divider */}
                <div style={{ paddingTop: 2, paddingBottom: 2, flexShrink: 0 }}>
                  <YellowDivider />
                </div>

                {/* Back button */}
                <div style={{ flexShrink: 0, padding: "6px 14px 10px" }}>
                  <button onClick={handleBack} style={{
                    ...KALLISTO, fontWeight: 700,
                    fontSize: "clamp(11px,2.7cqw,13px)",
                    color: "#b89a2a", letterSpacing: "0.04em",
                  }}>«« back</button>
                </div>

              </div>
            </div>
          )}

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
