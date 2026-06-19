import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const BASE = import.meta.env.BASE_URL;
const img  = (name: string) => `${BASE}${name}`;

const KALLISTO: React.CSSProperties = { fontFamily: "'Kallisto', sans-serif" };
const WIPE_MS = 340;
const TONE_MAX_GAIN = 0.120;

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

function SpeakerIcon({ active, size = 18 }: { active: boolean; size?: number }) {
  const c = active ? "#00ff55" : "rgba(255,255,255,0.38)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, display: "block" }}>
      <path d="M3 9v6h4l5 5V4L7 9H3z" fill={c} />
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill={c} />
      {active && (
        <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill={c} />
      )}
    </svg>
  );
}

// ─── Gold divider ─────────────────────────────────────────────────────────────

function GoldDivider() {
  return (
    <div style={{
      height: "1px", flexShrink: 0,
      background: "linear-gradient(90deg, transparent 0%, rgba(184,134,11,0.55) 20%, rgba(212,170,23,0.82) 50%, rgba(184,134,11,0.55) 80%, transparent 100%)",
      margin: "2px 10px",
    }} />
  );
}

// ─── Panel header (shared by both pages) ─────────────────────────────────────

function DiagHeader() {
  return (
    <div style={{ textAlign: "center", padding: "clamp(14px,3.8svh,22px) 12px 6px", flexShrink: 0 }}>
      <div style={{ ...KALLISTO, fontSize: "clamp(16px,4.3vw,20px)", fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "0.06em" }}>
        ~ Diagnostics ~
      </div>
      <div style={{ fontSize: "clamp(9px,2.3vw,11px)", color: "rgba(255,255,255,0.36)", fontStyle: "italic", marginTop: 5, lineHeight: 1.4, padding: "0 6px" }}>
        (Important: this should not be used as a substitute for professional medical diagnosis)
      </div>
    </div>
  );
}

// ─── Shared panel background style ───────────────────────────────────────────

const PANEL_BG: React.CSSProperties = {
  position: "absolute", inset: 0,
  background: "linear-gradient(158deg, rgba(9,26,19,0.95) 0%, rgba(4,16,12,0.97) 100%)",
  borderRadius: "22px",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onClose:      () => void;
  onNotch:      (freq: number | null) => void;
  currentNotch: number | null;
  onBoost:      (freq: number | null) => void;
  currentBoost: number | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiagnosticsPanel({ onClose, onNotch, currentNotch, onBoost, currentBoost }: Props) {
  const [page,             setPage]             = useState<1 | 2>(1);
  const [playingFreq,      setPlayingFreq]       = useState<number | null>(null);
  const [expandedBand,     setExpandedBand]      = useState<string | null>(null);
  const [toneVolume,       setToneVolume]        = useState(0.25);
  const [processCandidate, setProcessCandidate]  = useState<number | null>(null);
  const [doneAction,       setDoneAction]        = useState<{ freq: number; type: "notch" | "boost" } | null>(null);
  const [startPressed,     setStartPressed]      = useState(false);
  const [backPressed,      setBackPressed]       = useState(false);

  // Which band label contains the active (notched or boosted) frequency
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

  const handleSpeaker = useCallback((freq: number) => {
    if (playingFreq === freq) stopTone();
    else playTone(freq, volToGain(toneVolume));
  }, [playingFreq, playTone, stopTone, toneVolume]);

  const handleParentSpeaker = useCallback((freq: number, bandLabel: string) => {
    setExpandedBand(prev => (prev !== null && prev !== bandLabel) ? null : prev);
    if (playingFreq === freq) stopTone();
    else playTone(freq, volToGain(toneVolume));
  }, [playingFreq, playTone, stopTone, toneVolume]);

  const handleToggleBand = useCallback((label: string) => {
    stopTone();
    setExpandedBand(prev => prev === label ? null : label);
  }, [stopTone]);

  const handleProcessClick = (freq: number) => {
    stopTone();
    setProcessCandidate(freq);
  };

  const handleNotch = () => {
    if (processCandidate === null) return;
    onBoost(null);
    onNotch(processCandidate);
    setDoneAction({ freq: processCandidate, type: "notch" });
    setProcessCandidate(null);
  };

  const handleBoost = () => {
    if (processCandidate === null) return;
    onNotch(null);
    onBoost(processCandidate);
    setDoneAction({ freq: processCandidate, type: "boost" });
    setProcessCandidate(null);
  };

  const handleDoneClose = () => { setDoneAction(null); onClose(); };

  const handleBack = () => {
    setDoneAction(null);
    stopTone();
    setPage(1);
    setExpandedBand(null);
  };

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

        {/* Carousel container — clips both pages */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: "inset(0 round 22px)" }}>

          {/* Global ✕ — always above carousel */}
          <button onClick={handleClose} aria-label="Close" style={{
            position: "absolute", top: 0, left: 0, zIndex: 70,
            width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
            ...KALLISTO, fontWeight: 500, fontSize: "1.55rem", lineHeight: 1,
            color: "rgba(255,255,255,0.80)",
          }}>✕</button>

          {/* ════════════════════════════════════════════════════════════════════
              PAGE 1 — Instructions
          ════════════════════════════════════════════════════════════════════ */}
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${p1X})`, transition: wipeTx, willChange: "transform" }}>
            <div style={PANEL_BG} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>

              <DiagHeader />

              {/* Green subheading */}
              <div style={{ textAlign: "center", padding: "4px 16px 10px", flexShrink: 0 }}>
                <div style={{ ...KALLISTO, fontSize: "clamp(10.5px,2.7vw,12.5px)", fontWeight: 700, color: "#00cc44", letterSpacing: "0.04em", lineHeight: 1.45 }}>
                  WHAT IS YOUR TINNITUS FREQUENCY?<br />THIS TOOL CAN HELP YOU.
                </div>
              </div>

              {/* Numbered instruction list */}
              <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "0 18px 8px" }}>
                {([
                  "Use earbuds or headphones in a quiet space.",
                  "Start with very low volume and adjust to match the level of your internal ringing.",
                  "Audition each region, and note which one comes closest to the pitch of your ringing.",
                  "Click the arrow to expand and fine-tune.",
                  "Experiment with short bursts, vs longer tones, and at different volumes.  Once you identify your exact frequency, you may notice a temporary relief from the ringing.",
                ] as (string | React.ReactNode)[]).concat([
                  <span key="6">
                    Further experimentation: &nbsp;Click&nbsp;
                    <span style={{ color: "#ffcc00" }}>"PROCESS"</span>
                    &nbsp;on your specific frequency, and follow the prompts.  This may provide a more permanent solution.
                    <br /><span style={{ color: "#00cc44", fontSize: "0.9em" }}>• (see FAQ) for details.</span>
                  </span>,
                ]).map((text, i) => (
                  <div key={i} style={{ display: "flex", gap: 9, marginBottom: 12, alignItems: "flex-start" }}>
                    <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(15px,4vw,18px)", color: "#00cc44", minWidth: 20, lineHeight: 1.3, flexShrink: 0 }}>
                      {i + 1}.
                    </span>
                    <span style={{ ...KALLISTO, fontWeight: 300, fontSize: "clamp(12px,3vw,14.5px)", color: "rgba(255,255,255,0.80)", lineHeight: 1.48 }}>
                      {text}
                    </span>
                  </div>
                ))}
              </div>

              {/* START TEST */}
              <div style={{ padding: "4px 0 clamp(14px,3.5svh,24px)", display: "flex", justifyContent: "center", flexShrink: 0 }}>
                <button
                  onPointerDown={() => setStartPressed(true)}
                  onPointerUp={() => setStartPressed(false)}
                  onPointerLeave={() => setStartPressed(false)}
                  onClick={() => setPage(2)}
                  style={{
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

            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              PAGE 2 — Frequency list
          ════════════════════════════════════════════════════════════════════ */}
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${p2X})`, transition: wipeTx, willChange: "transform" }}>
            <div style={PANEL_BG} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>

              <DiagHeader />
              <GoldDivider />

              {/* Content row: scrollable list + volume meter */}
              <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

                {/* Scrollable frequency list */}
                <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "2px 0" }}>
                  {BANDS.map(band => {
                    const subs       = getSubBands(band);
                    const isExpanded = expandedBand === band.label;
                    const bPlaying   = playingFreq === band.base;
                    const hasActive  = activeBandLabel === band.label;

                    return (
                      <div key={band.label}>

                        {/* ── Parent row ── */}
                        <div style={{ display: "flex", alignItems: "center", minHeight: 36, padding: "3px 6px 3px 0" }}>

                          {/* LEFT: "EXPAND >" label — only when band is playing and collapsed */}
                          <div style={{ width: "clamp(48px,13vw,62px)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 5 }}>
                            {(bPlaying || hasActive) && !isExpanded && (
                              <button onClick={() => handleToggleBand(band.label)}
                                style={{ display: "flex", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(7.5px,1.9vw,9.5px)", color: "#ffcc00", letterSpacing: "0.07em" }}>EXPAND</span>
                                <svg width={8} height={10} viewBox="0 0 10 14" style={{ flexShrink: 0 }}>
                                  <polyline points="2,2 8,7 2,12" fill="none" stroke="#ffcc00" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            )}
                          </div>

                          {/* MIDDLE: band label */}
                          <button onClick={() => handleToggleBand(band.label)}
                            style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", paddingLeft: 2 }}>
                            <span style={{
                              ...KALLISTO,
                              fontSize: "clamp(14px,3.8vw,17px)",
                              fontWeight: (bPlaying || isExpanded || hasActive) ? 700 : 300,
                              color: (bPlaying || isExpanded) ? "#00ff55" : hasActive ? "#c8a832" : "rgba(255,255,255,0.72)",
                            }}>{band.label}</span>
                          </button>

                          {/* RIGHT: speaker button — hidden when expanded (acts as section header) */}
                          {!isExpanded && (
                            <button onClick={() => handleParentSpeaker(band.base, band.label)}
                              style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <SpeakerIcon active={bPlaying} size={16} />
                            </button>
                          )}
                        </div>

                        {/* ── Sub-band accordion ── */}
                        <div style={{
                          maxHeight: isExpanded ? `${subs.length * 44}px` : "0px",
                          overflow: "hidden",
                          transition: "max-height 0.28s ease",
                        }}>
                          <div style={{ paddingLeft: "clamp(28px,7.5vw,44px)", paddingBottom: 4 }}>
                            {subs.map(sf => {
                              const sfPlaying = playingFreq === sf;
                              const sfNotched = currentNotch === sf;
                              const sfBoosted = currentBoost === sf;
                              const sfActive  = sfNotched || sfBoosted;
                              return (
                                <div key={sf} style={{
                                  display: "flex", alignItems: "center", minHeight: 34,
                                  padding: "3px 6px 3px 0",
                                  borderRadius: sfActive ? 5 : 0,
                                  background: sfActive ? "rgba(184,154,42,0.11)" : "transparent",
                                }}>

                                  {/* LEFT: SELECT/reset label */}
                                  <div style={{ width: "clamp(44px,11.5vw,56px)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 5 }}>
                                    {sfPlaying && !sfActive && (
                                      <button onClick={() => handleProcessClick(sf)}
                                        style={{ display: "flex", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                        <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(7px,1.8vw,9px)", color: "#ffcc00", letterSpacing: "0.07em" }}>SELECT</span>
                                        <svg width={7} height={9} viewBox="0 0 10 14" style={{ flexShrink: 0 }}>
                                          <polyline points="2,2 8,7 2,12" fill="none" stroke="#ffcc00" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      </button>
                                    )}
                                    {sfActive && (
                                      <button onClick={() => { sfNotched ? onNotch(null) : onBoost(null); }}
                                        style={{ display: "flex", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                        <span style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(6.5px,1.7vw,8.5px)", color: "#b89a2a", letterSpacing: "0.04em" }}>reset</span>
                                        <svg width={7} height={9} viewBox="0 0 10 14" style={{ flexShrink: 0 }}>
                                          <polyline points="2,2 8,7 2,12" fill="none" stroke="#b89a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>

                                  {/* MIDDLE: frequency label */}
                                  <button onClick={() => handleSpeaker(sf)}
                                    style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
                                    <span style={{
                                      ...KALLISTO,
                                      fontSize: "clamp(12.5px,3.3vw,15.5px)",
                                      fontWeight: sfPlaying ? 700 : 300,
                                      color: sfPlaying ? "#00ff55" : sfActive ? "#c8a832" : "rgba(255,255,255,0.62)",
                                    }}>{fmtSub(sf)}</span>
                                  </button>

                                  {/* RIGHT: speaker */}
                                  <button onClick={() => handleSpeaker(sf)}
                                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <SpeakerIcon active={sfPlaying} size={14} />
                                  </button>

                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>

                {/* Volume meter column */}
                <div style={{ width: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingRight: 6 }}>
                  <DiagVolMeter volume={toneVolume} onChange={setToneVolume} />
                </div>

              </div>

              <GoldDivider />

              {/* Back button */}
              <div style={{ padding: "clamp(7px,1.8svh,13px) 14px", flexShrink: 0 }}>
                <button
                  onPointerDown={() => setBackPressed(true)}
                  onPointerUp={() => setBackPressed(false)}
                  onPointerLeave={() => setBackPressed(false)}
                  onClick={handleBack}
                  style={{
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

        </div>{/* end carousel */}
      </div>{/* end shadow wrapper */}

      {/* ════════════════════════════════════════════════════════════════════════
          PROCESS modal — "Great! You've pinpointed X"
      ════════════════════════════════════════════════════════════════════════ */}
      {processCandidate !== null && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 60,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 clamp(12px,3cqw,20px)",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.62)" }}
            onClick={() => setProcessCandidate(null)} />

          <div style={{
            position: "relative", zIndex: 10, width: "100%", maxWidth: 320,
            background: "linear-gradient(158deg, rgba(5,18,36,0.97) 0%, rgba(3,12,24,0.98) 100%)",
            borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)",
            padding: "clamp(16px,4.5svh,24px) 18px clamp(14px,4svh,20px)",
            filter: "drop-shadow(0 14px 48px rgba(0,0,0,0.90))",
          }}>

            {/* "Great!" header */}
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(13px,3.3vw,15px)", fontWeight: 700, marginBottom: 3 }}>
                Great!
              </div>
              <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(12px,3vw,14px)", fontWeight: 400, lineHeight: 1.45 }}>
                You've pinpointed
              </div>
              <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.95)", fontSize: "clamp(21px,5.5vw,26px)", fontWeight: 700, lineHeight: 1.2, margin: "4px 0" }}>
                {fmtSub(processCandidate)}
              </div>
              <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(12px,3vw,14px)", fontWeight: 400 }}>
                as your tinnitus frequency.
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 11, marginBottom: 10 }}>
              <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.65)", fontSize: "clamp(10.5px,2.6vw,12.5px)", textAlign: "center", marginBottom: 8 }}>
                From here you can choose:
              </div>
              <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.88)", fontSize: "clamp(11.5px,2.9vw,13.5px)", fontWeight: 700, lineHeight: 1.7, paddingLeft: 10 }}>
                1) Subtractive (notch) therapy.<br />
                2) Additive (peaking) therapy.
              </div>
              <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.50)", fontSize: "clamp(10px,2.5vw,12px)", lineHeight: 1.5, marginTop: 7, textAlign: "center" }}>
                Both have shown positive results<br />in reducing, or in some cases curing tinnitus.
              </div>
              <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(10.5px,2.6vw,12.5px)", fontWeight: 400, lineHeight: 1.5, marginTop: 7, textAlign: "center" }}>
                The earvana app can help you explore<br />both of these experimental therapies.
              </div>
              <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.30)", fontSize: "clamp(9px,2.2vw,10.5px)", lineHeight: 1.5, marginTop: 7, textAlign: "center" }}>
                NOTE:  As of May 2026, neither of these therapies are<br />medically conclusive.  This feature is provided for your<br />own personal experimentation.
              </div>
            </div>

            {/* Three buttons */}
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={handleBoost} style={{
                flex: 1, height: 38, borderRadius: 8,
                background: "rgba(0,180,80,0.14)", border: "1px solid rgba(0,220,80,0.42)",
                ...KALLISTO, fontWeight: 700, fontSize: "clamp(9.5px,2.4vw,11.5px)",
                color: "#00ee88", cursor: "pointer", letterSpacing: "0.03em",
              }}>∧ boost {fmtSub(processCandidate)}</button>

              <button onClick={() => setProcessCandidate(null)} style={{
                flex: 0.65, height: 38, borderRadius: 8,
                background: "rgba(55,58,62,0.90)", border: "1px solid rgba(255,255,255,0.11)",
                ...KALLISTO, fontWeight: 400, fontSize: "clamp(9.5px,2.4vw,11.5px)",
                color: "rgba(255,255,255,0.78)", cursor: "pointer",
              }}>cancel</button>

              <button onClick={handleNotch} style={{
                flex: 1, height: 38, borderRadius: 8,
                background: "rgba(0,110,210,0.14)", border: "1px solid rgba(0,150,255,0.42)",
                ...KALLISTO, fontWeight: 700, fontSize: "clamp(9.5px,2.4vw,11.5px)",
                color: "#00ccff", cursor: "pointer", letterSpacing: "0.03em",
              }}>∨ notch {fmtSub(processCandidate)}</button>
            </div>

          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          DONE card
      ════════════════════════════════════════════════════════════════════════ */}
      {doneAction !== null && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 65,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 clamp(12px,3cqw,20px)",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.68)" }} />

          <div style={{
            position: "relative", zIndex: 10, width: "100%", maxWidth: 310,
            background: "linear-gradient(158deg, rgba(5,18,36,0.97) 0%, rgba(3,12,24,0.98) 100%)",
            borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)",
            padding: "clamp(18px,5svh,26px) 22px clamp(16px,4svh,22px)",
            filter: "drop-shadow(0 14px 48px rgba(0,0,0,0.90))",
          }}>

            {/* ✕ — closes the whole DiagnosticsPanel */}
            <button onClick={handleDoneClose} style={{
              position: "absolute", top: 6, left: 6,
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none", cursor: "pointer",
              ...KALLISTO, fontSize: "1.25rem", color: "rgba(255,255,255,0.65)",
            }}>✕</button>

            <div style={{ textAlign: "center" }}>
              <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(20px,5vw,24px)", fontWeight: 700, marginBottom: 14 }}>
                Done!
              </div>
              <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(11.5px,2.9vw,13.5px)", lineHeight: 1.6 }}>
                The narrow-band frequency of
              </div>
              <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.92)", fontSize: "clamp(19px,4.8vw,23px)", fontWeight: 700, lineHeight: 1.2, margin: "5px 0" }}>
                {fmtSub(doneAction.freq)}
              </div>
              <div style={{ ...KALLISTO, color: "#00cc44", fontSize: "clamp(11.5px,2.9vw,13.5px)", lineHeight: 1.6 }}>
                {doneAction.type === "notch"
                  ? "has been notched out of the\nearvana audio mix."
                  : "has been boosted in the\nearvana audio mix."}
              </div>
              <div style={{ ...KALLISTO, color: "rgba(255,255,255,0.60)", fontSize: "clamp(10.5px,2.6vw,12.5px)", lineHeight: 1.55, marginTop: 14 }}>
                You can reset at any time<br />by coming back to the<br />diagnostic section.
              </div>
              <button
                onPointerDown={() => setBackPressed(true)}
                onPointerUp={() => setBackPressed(false)}
                onPointerLeave={() => setBackPressed(false)}
                onClick={handleBack}
                style={{
                  marginTop: 18, background: "none", border: "none", cursor: "pointer",
                  ...KALLISTO, fontWeight: 700, fontSize: "clamp(11px,2.7vw,13px)",
                  color: backPressed ? "#ffe880" : "#b89a2a",
                  letterSpacing: "0.04em",
                  textShadow: backPressed ? "0 0 8px #ffd040" : "none",
                  transition: "color 0.08s, text-shadow 0.08s",
                }}>«« back</button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
