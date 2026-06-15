import { useState, useRef, useEffect, useCallback } from "react";

const BASE = import.meta.env.BASE_URL;
const img  = (name: string) => `${BASE}${name}`;

const KALLISTO: React.CSSProperties = { fontFamily: "'Kallisto', sans-serif" };

// ─── Frequency data ───────────────────────────────────────────────────────────

const COARSE_FREQS = [500, 750, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];

function getSubBands(freq: number): number[] {
  if (freq === 500) return [500, 550, 600, 650, 700, 750];
  if (freq === 750) return [750, 800, 850, 900, 950, 1000];
  return Array.from({ length: 10 }, (_, i) => freq + i * 100);
}

function fmtCoarse(hz: number): string {
  return hz < 1000 ? `${hz} hz` : `${hz / 1000}k hz`;
}

function fmtSub(hz: number): string {
  if (hz < 1000) return `${hz} hz`;
  return `${(hz / 1000).toFixed(1)}k hz`;
}

// ─── Play triangle ────────────────────────────────────────────────────────────

function TriPlay({ active, size = 18 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20"
      style={{ flexShrink: 0, display: "block" }}>
      {active
        ? <polygon points="3,2 18,10 3,18" fill="#00ff55" />
        : <polygon points="3,2 18,10 3,18" fill="none"
            stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />}
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
    if (oscRef.current)  { try { oscRef.current.stop();        } catch { /**/ } oscRef.current.disconnect();  oscRef.current  = null; }
    if (gainRef.current) { try { gainRef.current.disconnect(); } catch { /**/ } gainRef.current = null; }
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
    osc.connect(g); g.connect(ctx.destination); osc.start();
    oscRef.current  = osc;
    gainRef.current = g;
    setPlayingFreq(freq);
  }, [killOsc]);

  const stopTone = useCallback(() => { killOsc(); setPlayingFreq(null); }, [killOsc]);

  const handleTriangle = useCallback((freq: number) => {
    if (playingFreq === freq) stopTone(); else playTone(freq);
  }, [playingFreq, playTone, stopTone]);

  useEffect(() => () => { killOsc(); ctxRef.current?.close().catch(() => {}); }, [killOsc]);

  // ── Chevron toggle (accordion) ───────────────────────────────────────────────
  // Only one row expanded at a time. Clicking an already-expanded row collapses it.
  // Clicking a different row collapses the previous one and stops any tone playing.

  const handleChevron = useCallback((freq: number) => {
    setExpandedFreq(prev => {
      if (prev === freq) { return null; }   // collapse
      stopTone();                            // stop tone when switching rows
      return freq;                           // expand new
    });
  }, [stopTone]);

  // ── NOTCH confirm ────────────────────────────────────────────────────────────

  const handleNotchConfirm = () => {
    if (notchCandidate !== null) {
      onNotch(notchCandidate);
      setNotchCandidate(null);
      stopTone();
      onClose();
    }
  };

  const anyExpanded = expandedFreq !== null;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    /* Full-screen, no overflow-hidden so X button can touch the pane corner */
    <div className="absolute inset-0 z-50">

      {/* Blurred background fills the screen */}
      <img src={img("homepage_BLUR.png")} alt=""
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* Panel container — inset with margins, NOT overflow-hidden */}
      <div style={{
        position: "absolute",
        top:    "clamp(18px,3vh,28px)",
        left:   "clamp(8px,2cqw,14px)",
        right:  "clamp(8px,2cqw,14px)",
        bottom: "clamp(10px,2vh,20px)",
        display: "flex", flexDirection: "column",
      }}>

        {/* ── X close — pinned to the top-left corner of the panel container,
            physically touching the pane edge ── */}
        <button
          onClick={() => { stopTone(); onClose(); }}
          aria-label="Close"
          style={{
            position: "absolute", top: 0, left: 0, zIndex: 20,
            width: 48, height: 48,
            display: "flex", alignItems: "center", justifyContent: "center",
            ...KALLISTO, fontWeight: 500,
            fontSize: "1.55rem", lineHeight: 1,
            color: "rgba(255,255,255,0.85)",
          }}>✕</button>

        {/* Panel card — overflow-hidden + rounded corners */}
        <div className="relative flex-1 flex flex-col overflow-hidden rounded-2xl">

          {/* Panel background image */}
          <img src={img("diag_bgpane1.png")} alt=""
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ objectFit: "fill" }} draggable={false} />

          {/* Header image — 65 % of panel width, centered, 12 px top margin */}
          <div className="relative z-10 flex-shrink-0 flex justify-center"
            style={{ marginTop: 12 }}>
            <img
              src={img(anyExpanded ? "diag_headertext_p2.png" : "diag_headertext_p1.png")}
              alt=""
              style={{ width: "65%", height: "auto", display: "block" }}
              draggable={false}
            />
          </div>

          {/* Frequency list — scrollable accordion */}
          <div className="relative z-10 flex-1 overflow-y-auto"
            style={{ scrollbarWidth: "none", padding: "10px 12px 16px" }}>

            {/*
              Centering strategy: center the inner column, but add paddingRight
              equal to the left-side decorators (chevron + gap + triangle + gap ≈ 52px)
              so the number labels land near the panel midpoint.
            */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{
                display: "flex", flexDirection: "column",
                gap: "clamp(6px,1.6vh,10px)",
                width: "fit-content",
                paddingRight: 52,   /* offsets chevron+triangle to re-center numbers */
              }}>

                {COARSE_FREQS.map(freq => {
                  const isActive   = playingFreq === freq;
                  const isExpanded = expandedFreq === freq;
                  const subs       = getSubBands(freq);
                  const label      = fmtCoarse(freq);

                  return (
                    <div key={freq}>

                      {/* ── Coarse row ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

                        {/* Chevron — always visible; rotates on expand */}
                        <button
                          onClick={() => handleChevron(freq)}
                          style={{
                            flexShrink: 0,
                            width: 28, height: 28,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "clamp(18px,4.5cqw,24px)",
                            lineHeight: 1,
                            color: isExpanded ? "#ffcc00" : "rgba(255,255,255,0.45)",
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.25s ease, color 0.2s ease",
                            ...KALLISTO, fontWeight: 700,
                          }}>›</button>

                        {/* Play area — triangle + label, whole thing is one tap target */}
                        <button
                          onClick={() => handleTriangle(freq)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            cursor: "pointer",
                          }}>
                          <TriPlay active={isActive} size={18} />
                          <span style={{
                            ...KALLISTO,
                            fontSize: "clamp(14px,3.5cqw,18px)",
                            fontWeight: isActive ? 700 : 400,
                            color: isActive ? "#00ff55" : "rgba(255,255,255,0.62)",
                            letterSpacing: "0.01em",
                          }}>{label}</span>
                        </button>

                      </div>

                      {/* ── Sub-bands — accordion with max-height transition ── */}
                      <div style={{
                        maxHeight: isExpanded ? `${subs.length * 38}px` : "0px",
                        overflow: "hidden",
                        transition: "max-height 0.28s ease",
                      }}>
                        <div style={{ paddingTop: 4, paddingBottom: 2,
                          display: "flex", flexDirection: "column", gap: "clamp(4px,1vh,7px)" }}>
                          {subs.map(sf => {
                            const sfActive = playingFreq === sf;
                            return (
                              <div key={sf}
                                style={{ display: "flex", alignItems: "center", gap: 8,
                                  paddingLeft: 34 /* one tab indent */ }}>

                                {/* Full row is tap target */}
                                <button
                                  onClick={() => handleTriangle(sf)}
                                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                  <TriPlay active={sfActive} size={15} />
                                  <span style={{
                                    ...KALLISTO,
                                    fontSize: "clamp(12px,3cqw,15px)",
                                    fontWeight: sfActive ? 700 : 400,
                                    color: sfActive ? "#00ff55" : "rgba(255,255,255,0.58)",
                                  }}>{fmtSub(sf)}</span>
                                </button>

                                {sfActive && (
                                  <button
                                    onClick={() => setNotchCandidate(sf)}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 3,
                                      flexShrink: 0,
                                      ...KALLISTO, fontWeight: 700,
                                      fontSize: "clamp(9px,2.2cqw,12px)",
                                      color: "#ffcc00",
                                    }}>
                                    NOTCH
                                    <svg width="7" height="7" viewBox="0 0 20 20">
                                      <polygon points="3,2 18,10 3,18" fill="#ffcc00" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  );
                })}

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── NOTCH confirmation popup ── */}
      {notchCandidate !== null && (() => {
        const label = fmtSub(notchCandidate);
        return (
          <div className="absolute inset-0 z-60 flex items-end justify-center"
            style={{
              paddingBottom: "clamp(40px,8vh,80px)",
              paddingLeft:   "clamp(8px,2cqw,14px)",
              paddingRight:  "clamp(8px,2cqw,14px)",
            }}>
            <div className="relative w-full" style={{ maxWidth: 420 }}>
              <img src={img("diag_pane2+txt.png")} alt=""
                className="w-full h-auto block" draggable={false} />

              <div className="absolute left-0 right-0 flex"
                style={{ bottom: "8%", gap: "clamp(8px,2cqw,14px)", padding: "0 clamp(14px,3.5cqw,24px)" }}>

                <button
                  onClick={() => setNotchCandidate(null)}
                  className="flex-1 flex items-center justify-center"
                  style={{
                    height: "clamp(34px,5vh,46px)", borderRadius: 8,
                    background: "rgba(90,90,90,0.65)", color: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    ...KALLISTO, fontWeight: 300, fontSize: "clamp(11px,2.8cqw,14px)",
                  }}>cancel</button>

                <button
                  onClick={handleNotchConfirm}
                  onPointerDown={() => setButtPressed(true)}
                  onPointerUp={() => setButtPressed(false)}
                  onPointerLeave={() => setButtPressed(false)}
                  className="relative flex-1 flex items-center justify-center overflow-hidden"
                  style={{ height: "clamp(34px,5vh,46px)", borderRadius: 8 }}>
                  <img src={img(buttPressed ? "diag_pane2Butt(OnCLK).png" : "diag_pane2Butt.png")}
                    alt="" className="absolute inset-0 w-full h-full"
                    style={{ objectFit: "fill" }} draggable={false} />
                  <span className="relative z-10"
                    style={{ ...KALLISTO, fontWeight: 700, fontSize: "clamp(11px,2.8cqw,14px)", color: "#00ff55" }}>
                    ✓ notch {label}
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
