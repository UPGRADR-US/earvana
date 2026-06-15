import { useState, useRef, useEffect, useCallback } from "react";

const BASE = import.meta.env.BASE_URL;
const img  = (name: string) => `${BASE}${name}`;

const KALLISTO: React.CSSProperties = { fontFamily: "'Kallisto', sans-serif" };

// ─── Frequency data (matches DiagFreqBreakdown.rtf) ───────────────────────────

const COARSE_FREQS = [500, 750, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];

function getSubBands(freq: number): number[] {
  if (freq === 500) return [500, 550, 600, 650, 700, 750];
  if (freq === 750) return [750, 800, 850, 900, 950, 1000];
  return Array.from({ length: 10 }, (_, i) => freq + i * 100);
}

function fmtCoarse(hz: number): { bold: string; light: string } {
  if (hz < 1000) return { bold: `${hz}`, light: "hz" };
  return { bold: `${hz / 1000}k`, light: "hz" };
}

function fmtSub(hz: number): { bold: string; light: string } {
  if (hz < 1000) return { bold: `${hz}`, light: "hz" };
  return { bold: `${(hz / 1000).toFixed(1)}k`, light: "hz" };
}

// ─── Play triangle ────────────────────────────────────────────────────────────

function TriPlay({ active, size = 18 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ flexShrink: 0, display: "block" }}>
      {active
        ? <polygon points="3,2 18,10 3,18" fill="#00ff55" />
        : <polygon points="3,2 18,10 3,18" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onClose:      () => void;
  onNotch:      (freq: number) => void;
  currentNotch: number | null;
}

export function DiagnosticsPanel({ onClose, onNotch }: Props) {
  const [playingFreq,    setPlayingFreq]    = useState<number | null>(null);
  const [expandedFreq,   setExpandedFreq]   = useState<number | null>(null);
  const [notchCandidate, setNotchCandidate] = useState<number | null>(null);
  const [buttPressed,    setButtPressed]    = useState(false);

  const ctxRef  = useRef<AudioContext | null>(null);
  const oscRef  = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // ── Tone engine ──────────────────────────────────────────────────────────────

  const killOsc = useCallback(() => {
    if (oscRef.current)  { try { oscRef.current.stop();        } catch { /* ok */ } oscRef.current.disconnect();  oscRef.current  = null; }
    if (gainRef.current) { try { gainRef.current.disconnect(); } catch { /* ok */ } gainRef.current = null; }
  }, []);

  const playTone = useCallback((freq: number) => {
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
    g.gain.value        = 0.22;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    oscRef.current  = osc;
    gainRef.current = g;
    setPlayingFreq(freq);
  }, [killOsc]);

  const stopTone = useCallback(() => { killOsc(); setPlayingFreq(null); }, [killOsc]);

  const handleTriangle = useCallback((freq: number) => {
    if (playingFreq === freq) stopTone(); else playTone(freq);
  }, [playingFreq, playTone, stopTone]);

  useEffect(() => () => { killOsc(); ctxRef.current?.close().catch(() => {}); }, [killOsc]);

  // ── Expand / collapse ────────────────────────────────────────────────────────

  const handleChevron    = useCallback((freq: number) => { stopTone(); setExpandedFreq(freq); }, [stopTone]);
  const collapseToCoarse = useCallback(() =>             { stopTone(); setExpandedFreq(null); }, [stopTone]);

  // ── NOTCH confirm ────────────────────────────────────────────────────────────

  const handleNotchConfirm = () => {
    if (notchCandidate !== null) { onNotch(notchCandidate); setNotchCandidate(null); stopTone(); onClose(); }
  };

  // ── Derived list data ────────────────────────────────────────────────────────

  const isExpanded   = expandedFreq !== null;
  const expandedIdx  = isExpanded ? COARSE_FREQS.indexOf(expandedFreq!) : -1;
  const subBands     = isExpanded ? getSubBands(expandedFreq!) : [];
  const contextAbove = expandedIdx > 0
    ? COARSE_FREQS.slice(Math.max(0, expandedIdx - 2), expandedIdx) : [];
  const contextBelow = expandedIdx >= 0 && expandedIdx < COARSE_FREQS.length - 1
    ? COARSE_FREQS.slice(expandedIdx + 1, Math.min(COARSE_FREQS.length, expandedIdx + 3)) : [];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    /* Outermost: full-screen, no overflow-hidden so X button can poke out */
    <div className="absolute inset-0 z-50">

      {/* Blurred background fills the screen */}
      <img src={img("homepage_BLUR.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* Panel container — inset with margins, NOT overflow-hidden so X can spill out */}
      <div style={{
        position:      "absolute",
        top:           "clamp(18px,3vh,28px)",
        left:          "clamp(8px,2cqw,14px)",
        right:         "clamp(8px,2cqw,14px)",
        bottom:        "clamp(10px,2vh,20px)",
        display:       "flex",
        flexDirection: "column",
      }}>

        {/* ── X close — oversized, sticks outside the top-left corner ── */}
        <button
          onClick={() => { stopTone(); onClose(); }}
          aria-label="Close"
          style={{
            position:       "absolute",
            top:            -20,
            left:           -20,
            zIndex:         10,
            width:          52,
            height:         52,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            color:          "rgba(255,255,255,0.82)",
            fontSize:       "1.55rem",
            lineHeight:     1,
            ...KALLISTO,
            fontWeight:     500,
          }}>✕</button>

        {/* Panel card — overflow-hidden for rounded corners + bgpane graphic */}
        <div className="relative flex-1 flex flex-col overflow-hidden rounded-2xl">

          {/* Panel background image */}
          <img src={img("diag_bgpane1.png")} alt=""
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ objectFit: "fill" }} draggable={false} />

          {/* Header image — 15 px margin from every panel edge */}
          <div className="flex-shrink-0 relative z-10">
            <img
              src={img(isExpanded ? "diag_headertext_p2.png" : "diag_headertext_p1.png")}
              alt=""
              style={{ display: "block", width: "calc(100% - 30px)", margin: "15px 15px 0 15px", height: "auto" }}
              draggable={false}
            />
          </div>

          {/* ← back link (phase 2 only) */}
          {isExpanded && (
            <div className="relative z-10 flex-shrink-0" style={{ padding: "6px 15px 0" }}>
              <button onClick={collapseToCoarse}
                style={{ ...KALLISTO, fontWeight: 300, fontSize: "clamp(10px,2.5cqw,13px)", color: "rgba(0,255,85,0.6)", textDecoration: "underline" }}>
                ← all frequencies
              </button>
            </div>
          )}

          {/* Frequency list — scrollable; outer centers the block, inner left-aligns items */}
          <div className="relative z-10 flex-1 overflow-y-auto"
            style={{ scrollbarWidth: "none", padding: "10px 15px 16px" }}>

            {/* Centering wrapper */}
            <div style={{ display: "flex", justifyContent: "center", height: "100%" }}>
              {/* Left-aligned item column, width driven by content */}
              <div style={{ display: "flex", flexDirection: "column", gap: isExpanded ? "clamp(5px,1.4vh,9px)" : "clamp(7px,1.8vh,12px)", width: "fit-content" }}>

                {!isExpanded ? (
                  /* ── Phase 1: coarse list ── */
                  <>
                    {COARSE_FREQS.map(freq => {
                      const active = playingFreq === freq;
                      const { bold, light } = fmtCoarse(freq);
                      return (
                        <div key={freq} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* » expand chevron — visible only on active row */}
                          <button
                            onClick={() => active && handleChevron(freq)}
                            tabIndex={active ? 0 : -1}
                            style={{
                              width: 24, flexShrink: 0, textAlign: "center",
                              ...KALLISTO, fontWeight: 700,
                              fontSize: "clamp(12px,3cqw,16px)",
                              color: "#ffcc00",
                              opacity: active ? 1 : 0,
                              cursor: active ? "pointer" : "default",
                            }}>»</button>

                          {/* Play triangle */}
                          <button onClick={() => handleTriangle(freq)} style={{ flexShrink: 0 }}>
                            <TriPlay active={active} size={18} />
                          </button>

                          {/* Label */}
                          <span style={{ ...KALLISTO, fontSize: "clamp(14px,3.5cqw,18px)", color: active ? "#fff" : "rgba(255,255,255,0.6)" }}>
                            <span style={{ fontWeight: 700 }}>{bold}</span>
                            <span style={{ fontWeight: 300, fontSize: "0.78em", color: "rgba(255,255,255,0.38)", marginLeft: 1 }}>{light}</span>
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  /* ── Phase 2: expanded sub-bands ── */
                  <>
                    {/* Context above */}
                    {contextAbove.map(freq => {
                      const { bold, light } = fmtCoarse(freq);
                      return (
                        <div key={freq} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.35 }}>
                          <div style={{ width: 24, flexShrink: 0 }} />
                          <button onClick={() => { collapseToCoarse(); setTimeout(() => playTone(freq), 40); }} style={{ flexShrink: 0 }}>
                            <TriPlay active={false} size={16} />
                          </button>
                          <span style={{ ...KALLISTO, fontSize: "clamp(12px,3cqw,15px)", color: "#fff" }}>
                            <span style={{ fontWeight: 700 }}>{bold}</span>
                            <span style={{ fontWeight: 300, marginLeft: 4, opacity: 0.5 }}>{light}</span>
                          </span>
                        </div>
                      );
                    })}

                    {/* Sub-bands */}
                    {subBands.map(freq => {
                      const active = playingFreq === freq;
                      const { bold, light } = fmtSub(freq);
                      return (
                        <div key={freq} style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 22 }}>
                          <button onClick={() => handleTriangle(freq)} style={{ flexShrink: 0 }}>
                            <TriPlay active={active} size={18} />
                          </button>
                          <span style={{ ...KALLISTO, fontSize: "clamp(14px,3.5cqw,18px)", color: active ? "#fff" : "rgba(255,255,255,0.6)" }}>
                            <span style={{ fontWeight: 700 }}>{bold}</span>
                            <span style={{ fontWeight: 300, fontSize: "0.78em", color: "rgba(255,255,255,0.38)", marginLeft: 1 }}>{light}</span>
                          </span>
                          {active && (
                            <button
                              onClick={() => setNotchCandidate(freq)}
                              style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, ...KALLISTO, fontWeight: 700, fontSize: "clamp(10px,2.5cqw,13px)", color: "#ffcc00" }}>
                              NOTCH
                              <svg width="8" height="8" viewBox="0 0 20 20">
                                <polygon points="3,2 18,10 3,18" fill="#ffcc00" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Context below */}
                    {contextBelow.map(freq => {
                      const { bold, light } = fmtCoarse(freq);
                      return (
                        <div key={freq} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.35 }}>
                          <div style={{ width: 24, flexShrink: 0 }} />
                          <button onClick={() => { collapseToCoarse(); setTimeout(() => playTone(freq), 40); }} style={{ flexShrink: 0 }}>
                            <TriPlay active={false} size={16} />
                          </button>
                          <span style={{ ...KALLISTO, fontSize: "clamp(12px,3cqw,15px)", color: "#fff" }}>
                            <span style={{ fontWeight: 700 }}>{bold}</span>
                            <span style={{ fontWeight: 300, marginLeft: 4, opacity: 0.5 }}>{light}</span>
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── NOTCH confirmation popup ── */}
      {notchCandidate !== null && (() => {
        const { bold, light } = fmtSub(notchCandidate);
        return (
          <div className="absolute inset-0 z-60 flex items-end justify-center"
            style={{ paddingBottom: "clamp(40px,8vh,80px)", paddingLeft: "clamp(8px,2cqw,14px)", paddingRight: "clamp(8px,2cqw,14px)" }}>
            <div className="relative w-full" style={{ maxWidth: 420 }}>

              {/* Popup panel with burned-in text */}
              <img src={img("diag_pane2+txt.png")} alt=""
                className="w-full h-auto block" draggable={false} />

              {/* Buttons — bottom ~17% of popup image */}
              <div className="absolute left-0 right-0 flex"
                style={{ bottom: "8%", gap: "clamp(8px,2cqw,14px)", padding: "0 clamp(14px,3.5cqw,24px)" }}>

                {/* Cancel */}
                <button
                  onClick={() => setNotchCandidate(null)}
                  className="flex-1 flex items-center justify-center"
                  style={{
                    height: "clamp(34px,5vh,46px)", borderRadius: 8,
                    background: "rgba(90,90,90,0.65)", color: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    ...KALLISTO, fontWeight: 300, fontSize: "clamp(11px,2.8cqw,14px)",
                  }}>
                  cancel
                </button>

                {/* Notch confirm */}
                <button
                  onClick={handleNotchConfirm}
                  onPointerDown={() => setButtPressed(true)}
                  onPointerUp={() => setButtPressed(false)}
                  onPointerLeave={() => setButtPressed(false)}
                  className="relative flex-1 flex items-center justify-center overflow-hidden"
                  style={{ height: "clamp(34px,5vh,46px)", borderRadius: 8 }}>
                  <img src={img(buttPressed ? "diag_pane2Butt(OnCLK).png" : "diag_pane2Butt.png")}
                    alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "fill" }} draggable={false} />
                  <span className="relative z-10"
                    style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(11px,2.8cqw,14px)", color: "#00ff55" }}>
                    ✓ notch {bold}{light}
                  </span>
                </button>

              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
