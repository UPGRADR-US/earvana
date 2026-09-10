import { useEffect, useRef, useState, type CSSProperties } from "react";

export const A = `${import.meta.env.BASE_URL}earphoria-redesign/`;
const APP_ASSET = import.meta.env.BASE_URL;
function flashClickable(target: EventTarget | null) {
  const button = target instanceof Element ? target.closest<HTMLButtonElement>(".earphoria-click-glow") : null;
  if (!button) return;
  button.classList.add("on-click");
  window.setTimeout(() => button.classList.remove("on-click"), 110);
}
export const categories = [
  { id: "oceans", prefix: "ocean", name: "Oceans", image: "TR_tn_oceans.png", tracks: ["high-tide beach", "low-tide beach", "low-tide bay", "waterlaps cove", "waterlaps cove cine"], trackIds: ["ocean_high_tide_beach","ocean_low_tide_beach","ocean_low_tide_bay","ocean_waterlaps_cove","ocean_waterlaps_cove_cine"] },
  { id: "rains", prefix: "rain", name: "Rains", image: "TR_tn_rains.png", tracks: ["lite drizzle", "lite shower", "downpour", "quiet storm", "rolling thunderstorm"], trackIds: ["rain_lite_drizzle","rain_lite_shower","rain_downpour","rain_quiet_storm","rain_rolling_thunderstorm"] },
  { id: "streams", prefix: "stream", name: "Streams", image: "TR_tn_streams.png", tracks: ["fountain", "mountain spring", "gentle brook", "cascading river"], trackIds: ["stream_fountain","stream_mountain_spring","stream_gentle_brook","stream_cascading_river"] },
  { id: "forests", prefix: "forest", name: "Forests", image: "TR_tn_forests.png", tracks: ["dusk calm", "night chorus", "amazon jungle"], trackIds: ["forest_dusk_calm","forest_night_chorus","forest_amazon_jungle"] },
  { id: "fields", prefix: "field", name: "Fields", image: "TR_tn_fields.png", tracks: ["dusk meadow", "midnight wetlands"], trackIds: ["field_dusk_meadow","field_midnight_wetlands"] },
  { id: "gardens", prefix: "garden", name: "Gardens", image: "TR_tn_gardens.png", tracks: ["tranquil koi pond", "spa moon garden", "morning melody"], trackIds: ["garden_tranquil_koi_pond","garden_spa_moon_garden","garden_morning_melody"] },
  { id: "fire", prefix: "fire", name: "Fire", image: "TR_tn_fire.png", tracks: ["chalet stone hearth", "campside firepit", "ceremonial bonfire"], trackIds: ["fire_chalet_stone_hearth","fire_campside_firepit","fire_ceremonial_bonfire"] },
  { id: "winds", prefix: "wind", name: "Winds", image: "TR_tn_winds.png", tracks: ["light breeze", "gusty winds", "whistling chinook"], trackIds: ["wind_light_breeze","wind_gusty_winds","wind_whistling_chinook"] },
  { id: "noise", prefix: "noise", name: "Noise", image: "TR_tn_noise.png", tracks: ["white wave", "white-static", "pink wave", "pink-static", "green wave", "green-static", "brown wave", "brown-static", "black wave"], trackIds: ["noise_white_wave","noise_white_static","noise_pink_wave","noise_pink_static","noise_green_wave","noise_green_static","noise_brown_wave","noise_brown_static","noise_black_wave"] },
];

export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

export function Logo() {
  return <div className="eh-logo"><span className="ear">◖</span><b><i>e</i>arphoria</b><small>tinnitus relief</small><em>IMMERSIVE NATURE SOUNDSCAPES</em></div>;
}

export function CategoryCarousel({ selected, playingIndex, pausedOffCourseIndex, resumeIndex, resumeSignal, isPlaying, onSelect, onActivateFirst }: { selected: number; playingIndex: number; pausedOffCourseIndex: number; resumeIndex: number; resumeSignal: number; isPlaying: boolean; onSelect: (i: number) => void; onActivateFirst: (i: number) => void }) {
  const count = categories.length;
  const dragStart = useRef<number | null>(null);
  const didDrag = useRef(false);
  const [dragRotation, setDragRotation] = useState(0);
  const [quickReturn, setQuickReturn] = useState(false);
  // Keep an unbounded cylinder position so crossing the last/first category
  // remains a single 40° step instead of animating the long way around.
  const [position, setPosition] = useState(selected);
  const angleStep = 360 / count;
  useEffect(() => {
    if (resumeSignal === 0 || resumeIndex < 0) return;
    const centered = ((position % count) + count) % count;
    if (centered === resumeIndex) return;
    let delta = resumeIndex - centered;
    if (delta > count / 2) delta -= count;
    if (delta < -count / 2) delta += count;
    setDragRotation(0);
    setQuickReturn(true);
    setPosition(current => current + delta);
    onSelect(resumeIndex);
    const timer = window.setTimeout(() => setQuickReturn(false), 300);
    return () => window.clearTimeout(timer);
    // This effect intentionally runs once per explicit resume request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSignal]);
  const finishDrag = (clientX: number) => {
    if (dragStart.current === null) return;
    const distance = clientX - dragStart.current;
    dragStart.current = null;
    const draggedDegrees = distance * .32;
    const magnitude = Math.abs(draggedDegrees);
    // The first category commits after 10°. Each additional full face of
    // travel commits another category.
    const stepCount = magnitude < 10 ? 0 : 1 + Math.floor((magnitude - 10) / angleStep);
    const steps = Math.sign(-draggedDegrees) * stepCount;
    setDragRotation(0);
    if (steps) {
      const nextPosition = position + steps;
      setPosition(nextPosition);
      onSelect(((nextPosition % count) + count) % count);
    }
  };
  const centeredIndex = ((position % count) + count) % count;
  return <div
    className="eh-carousel"
    data-testid="category-carousel"
    onPointerDown={(event) => {
      dragStart.current = event.clientX;
      didDrag.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (dragStart.current !== null) {
        const distance = event.clientX - dragStart.current;
        if (Math.abs(distance) > 4) didDrag.current = true;
        setDragRotation(distance * .32);
      }
    }}
    onPointerUp={(event) => finishDrag(event.clientX)}
    onPointerCancel={() => { dragStart.current = null; setDragRotation(0); }}
  >
    <div className="eh-carousel-cylinder" style={{ transform: `rotateY(${-position * angleStep + dragRotation}deg)`, transition: dragStart.current === null ? `transform ${quickReturn ? ".28s" : ".48s"} cubic-bezier(.22,.75,.25,1)` : "none" }}>
      {categories.map((category, i) => <button
          key={category.id}
          className={`eh-category-card ${i === centeredIndex ? "centered" : ""} ${i === centeredIndex && playingIndex < 0 && pausedOffCourseIndex < 0 ? "neutral-highlight" : ""} ${i === playingIndex ? "playing" : ""} ${i === pausedOffCourseIndex ? "paused-off-course" : ""}`}
          style={{ "--angle": `${i * angleStep}deg` } as CSSProperties}
          onClick={() => {
            if (didDrag.current) {
              didDrag.current = false;
              return;
            }
            if (isPlaying && i === centeredIndex && playingIndex !== centeredIndex) {
              onActivateFirst(i);
              return;
            }
            let delta = i - centeredIndex;
            if (delta > count / 2) delta -= count;
            if (delta < -count / 2) delta += count;
            setPosition(position + delta);
            onSelect(i);
          }}
          aria-label={`Select ${category.name}`}
        >
          <img src={`${A}${category.image}`} alt={category.name} draggable={false}/>
        </button>
      )}
    </div>
  </div>;
}

const EQ_BARS = [
  { duration: ".88s", delay: "0s" },
  { duration: "1.28s", delay: ".29s" },
  { duration: "1.04s", delay: ".56s" },
  { duration: "1.15s", delay: ".16s" },
];

export function PlayingEqBars({ className = "" }: { className?: string }) {
  return <svg className={`eh-playing-eq ${className}`} viewBox="0 0 46 32" aria-hidden="true">
    {EQ_BARS.map((bar, index) => <rect
      key={index}
      x={index * 12}
      y={0}
      width={8}
      height={32}
      rx={3}
      fill="#00ff55"
      style={{
        transformOrigin: `${index * 12 + 4}px 32px`,
        animation: `eqBar ${bar.duration} ease-in-out ${bar.delay} infinite`,
      }}
    />)}
  </svg>;
}

export function TrackList({ categoryIndex, selected, playing, paused, recommendedTrackIds, lockedTrackIds, onSelect }: { categoryIndex: number; selected: number; playing: boolean; paused: boolean; recommendedTrackIds: ReadonlySet<string>; lockedTrackIds?: ReadonlySet<string>; onSelect: (i: number) => void }) {
  const category = categories[categoryIndex];
  return <div className="eh-tracks" data-testid="track-list">{category.tracks.map((name, i) =>
    <button className={`eh-track ${selected === i ? `selected ${playing ? "playing" : paused ? "paused" : "idle"}` : ""}`} key={name} onClick={() => onSelect(i)} data-testid={`track-${i}`}>
      {selected === i && <img className="eh-track-highlight" src={`${APP_ASSET}TrackHilite-${playing ? "Green" : "Yellow"}.png`} alt=""/>}
      <span><strong>{category.prefix}</strong><b className="eh-colon">:</b>{name}{recommendedTrackIds.has(category.trackIds[i]) && <span className="eh-recommendation-asterisk" aria-label="Recommended for your RingMatch frequency">*</span>}{lockedTrackIds?.has(category.trackIds[i]) && <span className="eh-track-lock" aria-label="Premium — locked">🔒</span>}</span>
      {selected === i && playing && <PlayingEqBars className="eh-track-playing-animation"/>}
    </button>)}</div>;
}

export function Volume({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [isEmphasized, setIsEmphasized] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);
  const emphasize = () => {
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    setIsEmphasized(true);
    fadeTimerRef.current = window.setTimeout(() => {
      setIsEmphasized(false);
      fadeTimerRef.current = null;
    }, 250);
  };
  useEffect(() => () => {
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
  }, []);
  return <label className={`eh-volume${isEmphasized ? " is-emphasized" : ""}`} onPointerDown={emphasize} onPointerUp={emphasize}><span>volume</span><input aria-label="Volume" type="range" min="0" max="100" value={value} onChange={e => { emphasize(); onChange(Number(e.target.value)); }}/><div className="led-art"><img src={`${A}VolSldrBase-horizontal.png`} alt="" /><img className="led-art-fill" src={`${A}VolSldr_LEDS-horizontal.png`} alt="" style={{ clipPath: `inset(0 ${100-value}% 0 0)` }}/></div></label>;
}

export function Console({ playing, paused, timerCompleted, onPlay, onPause, timerOn, timeRemaining, ringOpen, ringMatchSelected, notchedFreq, boostedFreq, onTimer, onRing, onInfo, onSettings, volume, setVolume }: any) {
  const activeFreq = notchedFreq ?? boostedFreq;
  const ringActive = ringOpen || ringMatchSelected || activeFreq !== null;
  const ringArtworkOn = ringOpen || activeFreq !== null;
  const frequencyLabel = activeFreq === null
    ? null
    : activeFreq >= 1000 ? `${(activeFreq / 1000).toFixed(1)}k` : `${activeFreq}`;
  const timerLabel = timeRemaining < 60
    ? `:${String(Math.max(0, timeRemaining)).padStart(2, "0")}`
    : `${Math.floor(timeRemaining / 3600)}:${String(Math.floor((timeRemaining % 3600) / 60)).padStart(2, "0")}`;
  const timerFading = playing && timeRemaining > 0 && timeRemaining <= 59;
  return <div className="eh-console"
    onPointerDownCapture={event => flashClickable(event.target)}
    onClickCapture={event => { if (event.detail === 0) flashClickable(event.target); }}>
    <div className="eh-controls">
      <button onClick={onRing} className={`eh-control earphoria-click-glow ${ringActive ? "active" : ""}`} data-testid="button-ring"><span className="eh-control-art"><img src={`${A}RingMatchButt(${ringArtworkOn ? "ON" : "OFF"}).png`} />{ringMatchSelected && activeFreq === null && <span className="eh-ringmatch-selected-star" aria-label="RingMatch frequency selected">*</span>}{frequencyLabel && <><span className="eh-notch-arrow" aria-hidden="true">{notchedFreq === null && boostedFreq !== null ? "∧" : "∨"}</span><small className="eh-inside-status">{frequencyLabel}</small></>}</span><span>RINGMATCH</span></button>
      <button onClick={onPause} className={`eh-control ${paused ? "paused" : ""}`} data-testid="button-pause"><span className="eh-control-art"><img src={`${A}PAUSEbutt(${paused ? "ON" : "OFF"}).png`} /></span><span>PAUSE</span></button>
      <button onClick={onPlay} className={`eh-control ${playing ? "active" : ""}`} data-testid="button-play"><span className="eh-control-art"><img src={`${A}PLAYbutt(${playing ? "ON" : "OFF"}).png`} /></span><span>PLAY</span></button>
      <button onClick={onTimer} className={`eh-control earphoria-click-glow ${timerOn ? "active" : ""}`} data-testid="button-timer"><span className="eh-control-art"><img src={`${A}TimerButt(${timerOn ? "ON" : "OFF"}).png`} />{timerOn && <small className={`eh-inside-status eh-timer-status${timerFading ? " final-minute" : ""}${timerCompleted ? " timer-completed" : ""}`}>{timerLabel}</small>}</span><span>TIMER</span></button>
    </div>
    <div className="eh-secondary"><button onClick={onInfo} className="earphoria-click-glow" data-testid="button-info"><img src={`${A}InfoButt.png`} /></button>{playing && <PlayingEqBars className="eh-console-playing-animation"/>}<button onClick={onSettings} className="gear earphoria-click-glow" data-testid="button-settings"><img src={`${A}Settings_Sprocket.png`} alt="Settings" /></button></div>
    <Volume value={volume} onChange={setVolume}/>
  </div>;
}