import { useState, useRef, useEffect, useCallback } from "react";

// ─── Frequency data ────────────────────────────────────────────────────────────

const COARSE_FREQS = [500, 750, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];

function getSubBands(freq: number): number[] {
  const step = freq < 1000 ? 50 : 100;
  return Array.from({ length: 10 }, (_, i) => freq + i * step);
}

function fmtCoarse(hz: number): { bold: string; light: string } {
  if (hz < 1000) return { bold: `${hz}`, light: "hz" };
  const k = hz / 1000;
  return { bold: `${k}k`, light: "hz" };
}

function fmtSub(hz: number): { bold: string; light: string } {
  if (hz < 1000) return { bold: `${hz}`, light: "hz" };
  const k = hz / 1000;
  return { bold: `${k.toFixed(1)}k`, light: "hz" };
}

// ─── Triangle SVG icons ────────────────────────────────────────────────────────

function TriPlay({ active, size = 20 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ flexShrink: 0, display: "block" }}>
      {active
        ? <polygon points="3,2 18,10 3,18" fill="#00ff55" />
        : <polygon points="3,2 18,10 3,18" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />}
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onNotch: (freq: number) => void;
  currentNotch: number | null;
}

export function DiagnosticsPanel({ onClose, onNotch }: Props) {
  const [playingFreq, setPlayingFreq]     = useState<number | null>(null);
  const [expandedFreq, setExpandedFreq]   = useState<number | null>(null);
  const [notchCandidate, setNotchCandidate] = useState<number | null>(null);

  const ctxRef  = useRef<AudioContext | null>(null);
  const oscRef  = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // ── Tone engine ─────────────────────────────────────────────────────────────

  const killOsc = useCallback(() => {
    if (oscRef.current) {
      try { oscRef.current.stop(); } catch { /* already stopped */ }
      try { oscRef.current.disconnect(); } catch { /* ok */ }
      oscRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch { /* ok */ }
      gainRef.current = null;
    }
  }, []);

  const playTone = useCallback((freq: number) => {
    killOsc();
    if (!ctxRef.current) {
      const Ctx = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        ?? window.AudioContext;
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

  const stopTone = useCallback(() => {
    killOsc();
    setPlayingFreq(null);
  }, [killOsc]);

  const toggleTone = useCallback((freq: number) => {
    setPlayingFreq(prev => {
      if (prev === freq) { killOsc(); return null; }
      return freq; // actual play runs in effect below
    });
    // If it was a different freq (or null), play the new one
    setPlayingFreq(prev => {
      if (prev === freq) return freq; // unchanged, but osc hasn't started yet — handle below
      return freq;
    });
  }, [killOsc]);

  // Simpler: just call playTone/stopTone directly
  const handleTriangle = useCallback((freq: number) => {
    if (playingFreq === freq) stopTone();
    else playTone(freq);
  }, [playingFreq, playTone, stopTone]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      killOsc();
      ctxRef.current?.close().catch(() => {});
    };
  }, [killOsc]);

  // ── Expand / collapse ────────────────────────────────────────────────────────

  const handleChevron = useCallback((freq: number) => {
    stopTone();
    setExpandedFreq(freq);
  }, [stopTone]);

  const collapseToCoarse = useCallback(() => {
    stopTone();
    setExpandedFreq(null);
  }, [stopTone]);

  // ── NOTCH ───────────────────────────────────────────────────────────────────

  const handleNotchConfirm = () => {
    if (notchCandidate !== null) {
      onNotch(notchCandidate);
      setNotchCandidate(null);
      stopTone();
      onClose();
    }
  };

  // ── Derived list data ────────────────────────────────────────────────────────

  const expandedIdx   = expandedFreq !== null ? COARSE_FREQS.indexOf(expandedFreq) : -1;
  const subBands      = expandedFreq !== null ? getSubBands(expandedFreq) : [];
  const contextAbove  = expandedIdx > 0
    ? COARSE_FREQS.slice(Math.max(0, expandedIdx - 2), expandedIdx)
    : [];
  const contextBelow  = expandedIdx >= 0 && expandedIdx < COARSE_FREQS.length - 1
    ? COARSE_FREQS.slice(expandedIdx + 1, Math.min(COARSE_FREQS.length, expandedIdx + 3))
    : [];

  const isExpanded = expandedFreq !== null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}>

      {/* Glass panel */}
      <div className="flex-1 overflow-hidden flex flex-col mx-3 my-5 rounded-2xl"
        style={{ background: "rgba(12,26,16,0.97)", border: "1px solid rgba(0,255,85,0.18)" }}>

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-5 pt-5 pb-2">
          <button
            onClick={() => { stopTone(); onClose(); }}
            className="text-white/60 hover:text-white leading-none font-mono"
            style={{ fontSize: "1.15rem" }}
            aria-label="Close">✕</button>

          <div className="text-center mt-1">
            <div style={{ fontFamily: "monospace", fontSize: "1.55rem", color: "#00ff55", letterSpacing: "0.06em" }}>
              diagnostics
            </div>
            <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.38)", fontStyle: "italic", marginTop: "4px", lineHeight: 1.4 }}>
              (important: this should not be used as<br />a substitute for professional medical diagnosis.)
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: "10px", fontFamily: "monospace", fontSize: "0.88rem", color: "#00ff55" }}>
            find your frequency:
          </div>
        </div>

        {/* ── Instructions ── */}
        <div className="flex-shrink-0 px-5 pb-3"
          style={{ fontFamily: "monospace", fontSize: "0.68rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.6 }}>
          {!isExpanded ? (
            <div className="space-y-0.5">
              <div><span style={{ color: "#00ff55", fontWeight: 700 }}>1.</span> use earbuds or headphones in a quiet space.</div>
              <div><span style={{ color: "#00ff55", fontWeight: 700 }}>2.</span> adjust the volume to match your internal ringing.</div>
              <div><span style={{ color: "#00ff55", fontWeight: 700 }}>3.</span> click through each, holding for 1–2 seconds.</div>
              <div><span style={{ color: "#00ff55", fontWeight: 700 }}>4.</span> notice which one best matches your ringing.</div>
              <div><span style={{ color: "#00ff55", fontWeight: 700 }}>5.</span> click the arrows to expand that frequency range.</div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div><span style={{ color: "#00ff55", fontWeight: 700 }}>5.</span> narrow it down to pinpoint your exact frequency.</div>
              <div><span style={{ color: "#00ff55", fontWeight: 700 }}>6.</span> (optional:) click "NOTCH" for tinnitus suppression.</div>
              <div style={{ paddingLeft: "14px", fontSize: "0.58rem", color: "rgba(255,255,255,0.35)", marginTop: "1px" }}>
                (click again to stop tone)
              </div>
              {/* Back link */}
              <div style={{ marginTop: "4px" }}>
                <button onClick={collapseToCoarse}
                  style={{ color: "rgba(0,255,85,0.55)", fontSize: "0.62rem", fontFamily: "monospace", textDecoration: "underline" }}>
                  ← all frequencies
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Frequency list ── */}
        <div className="flex-1 overflow-y-auto pb-4"
          style={{ scrollbarWidth: "none", paddingLeft: "clamp(16px,4cqw,28px)", paddingRight: "clamp(16px,4cqw,28px)" }}>

          {!isExpanded ? (
            /* Phase 1 — coarse list */
            <div className="space-y-2">
              {COARSE_FREQS.map(freq => {
                const active = playingFreq === freq;
                const { bold, light } = fmtCoarse(freq);
                return (
                  <div key={freq} className="flex items-center" style={{ gap: "8px" }}>
                    {/* >> chevron — only on active row */}
                    <button
                      onClick={() => active && handleChevron(freq)}
                      style={{
                        width: "26px", fontFamily: "monospace", fontSize: "0.85rem",
                        color: "#ffcc00", fontWeight: 700, textAlign: "center",
                        opacity: active ? 1 : 0, cursor: active ? "pointer" : "default",
                        flexShrink: 0,
                      }}
                      tabIndex={active ? 0 : -1}
                      aria-hidden={!active}
                    >»</button>

                    {/* Play triangle */}
                    <button onClick={() => handleTriangle(freq)} style={{ flexShrink: 0 }}>
                      <TriPlay active={active} size={20} />
                    </button>

                    {/* Label */}
                    <span style={{ fontFamily: "monospace", fontSize: "1rem", color: active ? "#fff" : "rgba(255,255,255,0.65)" }}>
                      <strong style={{ fontWeight: 700 }}>{bold}</strong>
                      <span style={{ fontSize: "0.78em", color: "rgba(255,255,255,0.38)", marginLeft: "1px" }}>{light}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Phase 2 — expanded sub-bands with context rows */
            <div className="space-y-1.5">
              {/* Context above */}
              {contextAbove.map(freq => {
                const { bold, light } = fmtCoarse(freq);
                return (
                  <div key={freq} className="flex items-center" style={{ gap: "8px", opacity: 0.38 }}>
                    <div style={{ width: "26px", flexShrink: 0 }} />
                    <button onClick={() => { collapseToCoarse(); setTimeout(() => playTone(freq), 50); }}
                      style={{ flexShrink: 0 }}>
                      <TriPlay active={false} size={17} />
                    </button>
                    <span style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "#fff" }}>
                      <strong>{bold}</strong>
                      <span style={{ fontSize: "0.78em", marginLeft: "4px", opacity: 0.5 }}>{light}</span>
                    </span>
                  </div>
                );
              })}

              {/* Sub-bands */}
              {subBands.map(freq => {
                const active = playingFreq === freq;
                const { bold, light } = fmtSub(freq);
                return (
                  <div key={freq} className="flex items-center" style={{ gap: "8px", paddingLeft: "24px" }}>
                    <button onClick={() => handleTriangle(freq)} style={{ flexShrink: 0 }}>
                      <TriPlay active={active} size={20} />
                    </button>
                    <span style={{ fontFamily: "monospace", fontSize: "1rem", flex: 1, color: active ? "#fff" : "rgba(255,255,255,0.65)" }}>
                      <strong style={{ fontWeight: 700 }}>{bold}</strong>
                      <span style={{ fontSize: "0.78em", color: "rgba(255,255,255,0.38)", marginLeft: "1px" }}>{light}</span>
                    </span>
                    {active && (
                      <button
                        onClick={() => setNotchCandidate(freq)}
                        className="flex items-center flex-shrink-0"
                        style={{ gap: "4px", fontFamily: "monospace", fontSize: "0.7rem", color: "#ffcc00", fontWeight: 700 }}>
                        NOTCH
                        <svg width="9" height="9" viewBox="0 0 20 20">
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
                  <div key={freq} className="flex items-center" style={{ gap: "8px", opacity: 0.38 }}>
                    <div style={{ width: "26px", flexShrink: 0 }} />
                    <button onClick={() => { collapseToCoarse(); setTimeout(() => playTone(freq), 50); }}
                      style={{ flexShrink: 0 }}>
                      <TriPlay active={false} size={17} />
                    </button>
                    <span style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "#fff" }}>
                      <strong>{bold}</strong>
                      <span style={{ fontSize: "0.78em", marginLeft: "4px", opacity: 0.5 }}>{light}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── NOTCH confirmation popup ── */}
      {notchCandidate !== null && (() => {
        const { bold, light } = fmtSub(notchCandidate);
        return (
          <div className="absolute inset-0 z-60 flex items-center justify-center px-4">
            <div className="w-full rounded-2xl p-5"
              style={{ maxWidth: "370px", background: "rgba(72,78,72,0.98)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "#fff", fontWeight: 700, textAlign: "center", marginBottom: "12px" }}>
                "notching" any frequency is optional:
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "0.67rem", color: "rgba(255,255,255,0.78)", lineHeight: 1.6, textAlign: "center" }}
                className="space-y-2">
                <p>&gt; recent studies show this technique may help<br />train the brain to suppress the internal ringing.</p>
                <p>&gt; this is not a guarantee. results vary among patients.</p>
                <p>&gt; this frequency will be remembered and notched<br />from your audio playback.<br />you can reset at any time.</p>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setNotchCandidate(null)}
                  className="flex-1 py-2 rounded-xl font-mono text-sm"
                  style={{ background: "rgba(120,120,120,0.45)", color: "#fff" }}>
                  cancel
                </button>
                <button
                  onClick={handleNotchConfirm}
                  className="flex-1 py-2 rounded-xl font-mono text-sm flex items-center justify-center gap-1"
                  style={{ background: "rgba(30,55,35,0.9)", color: "#00ff55", border: "1px solid rgba(0,255,85,0.35)" }}>
                  ✓ notch {bold}{light}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
