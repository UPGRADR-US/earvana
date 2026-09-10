import { useEffect, useRef, useState } from "react";
import { CategoryCarousel, Console, TrackList, A } from "./shared";
import { TimerOverlay } from "./TimerOverlay";
import { InfoFaq } from "./InfoFaq";
import "./earphoria.css";

export function UpdatedHome() {
  const [category, setCategory] = useState(0), [selected, setSelected] = useState(-1), [playing, setPlaying] = useState(false), [paused, setPaused] = useState(false);
  const [durationStep, setDurationStep] = useState(10), [timeRemaining, setTimeRemaining] = useState(0), [timerCompleted, setTimerCompleted] = useState(false), [ringOpen, setRingOpen] = useState(false), [notchedFreq, setNotchedFreq] = useState<number | null>(null), [boostedFreq, setBoostedFreq] = useState<number | null>(null), [overlay, setOverlay] = useState<"timer"|"timer-closing"|"info"|null>(null), [volume, setVolume] = useState(72);
  const [timerTweakSignal, setTimerTweakSignal] = useState(0);
  const [recommendedTrackIds, setRecommendedTrackIds] = useState<Set<string>>(new Set());
  const [lockedTrackIds, setLockedTrackIds] = useState<Set<string>>(new Set());
  const [ringMatchSelected, setRingMatchSelected] = useState(false);
  const [playingCategory, setPlayingCategory] = useState(-1);
  const [resumeCarouselSignal, setResumeCarouselSignal] = useState(0);
  const lastPlayingCategoryRef = useRef(-1);
  const timerCompletionSignalRef = useRef<number | null>(null);
  const timerAutoPopupTimeoutRef = useRef<number | null>(null);
  const send = (action: string, payload: Record<string, number> = {}) =>
    window.parent.postMessage({ type: "earphoria-redesign-command", action, ...payload }, window.location.origin);
  const pause = () => send("pause");
  const play = () => {
    if (lastPlayingCategoryRef.current >= 0 && category !== lastPlayingCategoryRef.current) {
      setResumeCarouselSignal(signal => signal + 1);
    }
    send("play");
  };
  const selectCategory = (index: number) => {
    setCategory(index);
    setSelected(-1);
    send("select-category", { categoryIndex: index });
  };
  const selectTrack = (index: number) => {
    setSelected(index);
    send("select-track", { categoryIndex: category, trackIndex: index });
  };
  const activateFirstTrack = (categoryIndex: number) => {
    setCategory(categoryIndex);
    setSelected(0);
    send("select-track", { categoryIndex, trackIndex: 0 });
  };
  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume);
    send("set-volume", { volume: nextVolume });
  };

  useEffect(() => {
    const receiveState = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type !== "earphoria-redesign-state") return;
      setCategory(event.data.categoryIndex);
      const nextPlayingCategory = Number.isInteger(event.data.playingCategoryIndex) ? event.data.playingCategoryIndex : -1;
      setPlayingCategory(nextPlayingCategory);
      if (nextPlayingCategory >= 0) lastPlayingCategoryRef.current = nextPlayingCategory;
      setSelected(event.data.trackIndex);
      setPlaying(event.data.isPlaying);
      setPaused(event.data.isPaused);
      setVolume(event.data.volume);
      setRingOpen(Boolean(event.data.ringOpen));
      setRingMatchSelected(Boolean(event.data.ringMatchSelected));
      setNotchedFreq(Number.isFinite(event.data.notchedFreq) ? event.data.notchedFreq : null);
      setBoostedFreq(Number.isFinite(event.data.boostedFreq) ? event.data.boostedFreq : null);
      if (Number.isInteger(event.data.durationStep)) setDurationStep(event.data.durationStep);
      if (Number.isFinite(event.data.timeRemaining)) setTimeRemaining(event.data.timeRemaining);
      setTimerCompleted(Boolean(event.data.timerCompletionHold));
      setRecommendedTrackIds(new Set(Array.isArray(event.data.recommendedTrackIds) ? event.data.recommendedTrackIds : []));
      setLockedTrackIds(new Set(Array.isArray(event.data.lockedTrackIds) ? event.data.lockedTrackIds : []));
      if (Number.isInteger(event.data.timerCompletionSignal)) {
        if (
          timerCompletionSignalRef.current !== null
          && timerCompletionSignalRef.current !== event.data.timerCompletionSignal
        ) {
          setOverlay(current => current === "timer" ? "timer-closing" : current);
        }
        timerCompletionSignalRef.current = event.data.timerCompletionSignal;
      }
    };
    window.addEventListener("message", receiveState);
    send("ready");
    return () => window.removeEventListener("message", receiveState);
  }, []);

  useEffect(() => {
    const clearAutoPopup = () => {
      if (timerAutoPopupTimeoutRef.current !== null) {
        window.clearTimeout(timerAutoPopupTimeoutRef.current);
        timerAutoPopupTimeoutRef.current = null;
      }
    };
    if (!playing || durationStep >= 10) {
      clearAutoPopup();
      return;
    }

    timerAutoPopupTimeoutRef.current = window.setTimeout(() => {
      timerAutoPopupTimeoutRef.current = null;
      setOverlay("timer");
    }, 5 * 60 * 1000);

    return () => {
      clearAutoPopup();
    };
  }, [playing, durationStep, timerTweakSignal]);
  useEffect(() => {
    if (overlay !== "timer-closing") return;
    const closeTimer = window.setTimeout(() => setOverlay(null), 220);
    return () => window.clearTimeout(closeTimer);
  }, [overlay]);
  const carouselPlayingCategory = playingCategory >= 0
    ? playingCategory
    : paused && category === lastPlayingCategoryRef.current
      ? lastPlayingCategoryRef.current
      : -1;
  const pausedOffCourseCategory = paused
    && lastPlayingCategoryRef.current >= 0
    && category !== lastPlayingCategoryRef.current
      ? lastPlayingCategoryRef.current
      : -1;
  return <main className="eh-app" data-testid="updated-home"><div className="eh-bg home-jib" style={{ ["--eh-jib-state" as string]: playing ? "running" : "paused" }}/>
    <header className="eh-top-banner-separated" aria-label="earphoria tinnitus relief">
      <div className="eh-top-banner-pane">
        <img className="eh-top-banner-base" src={`${A}TopBannerBase24.png`} alt=""/>
        <img className="eh-top-banner-logo" src={`${A}TopBannerLogo23.png`} alt="earphoria tinnitus relief — immersive nature soundscapes"/>
        <img className="eh-top-banner-badge" src={`${A}TopBannerRMbadge23.png`} alt="RingMatch Technology"/>
      </div>
    </header>
    <CategoryCarousel selected={category} playingIndex={carouselPlayingCategory} pausedOffCourseIndex={pausedOffCourseCategory} resumeIndex={lastPlayingCategoryRef.current} resumeSignal={resumeCarouselSignal} isPlaying={playing} onSelect={selectCategory} onActivateFirst={activateFirstTrack}/>
    <section className="eh-workspace"><TrackList categoryIndex={category} selected={selected} playing={playing} paused={paused} recommendedTrackIds={recommendedTrackIds} lockedTrackIds={lockedTrackIds} onSelect={selectTrack}/></section>
    <Console playing={playing} paused={paused} timerCompleted={timerCompleted} onPlay={play} onPause={pause} timerOn={durationStep < 10} timeRemaining={timeRemaining} ringOpen={ringOpen} ringMatchSelected={ringMatchSelected} notchedFreq={notchedFreq} boostedFreq={boostedFreq} onTimer={() => setOverlay("timer")} onRing={() => send("open-ringmatch")} onInfo={() => setOverlay("info")} onSettings={() => send("open-settings")} volume={volume} setVolume={changeVolume}/>
    {(overlay === "timer" || overlay === "timer-closing") && <TimerOverlay onClose={() => setOverlay("timer-closing")} isClosing={overlay === "timer-closing"} timerCompleted={timerCompleted} durationStep={durationStep} timeRemaining={timeRemaining} isPlaying={playing} onDurationChange={(nextStep) => { setTimerTweakSignal(signal => signal + 1); send("set-duration", { durationStep: nextStep }); }} onAdjust={(deltaSeconds) => { setTimerTweakSignal(signal => signal + 1); send("adjust-timer", { deltaSeconds }); }}/>}
    {overlay === "info" && <InfoFaq onClose={() => setOverlay(null)}/>}
  </main>;
}
export default UpdatedHome;