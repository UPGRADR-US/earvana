import "../../lib/developmentBlinkClock";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { developmentFreeview } from "../../lib/developmentFreeview";
import { playbackUsage } from "../../lib/playbackUsage";
import "./freeview-test.css";
import { FreeviewBar } from "./FreeviewBar";
import { startFreshFreeviewTest } from "../../lib/freeviewTestBootstrap";

type TestSnapshot = { midpointExpirationTrackIds: ReadonlySet<string>; isCountingDown: boolean; countdown: string; exhaustedTrackIds: ReadonlySet<string>; usedTrackIds: ReadonlySet<string>; countdownByTrack: Readonly<Record<string, string>> };
export function formatFreeviewCountdown(secondsUsed: number): string {
  const remaining = Math.ceil(Math.max(0, 60 - secondsUsed));
  return `:${String(remaining).padStart(2, "0")}`;
}
/** Read-only UI observer. Never schedules audio or modifies counters/entitlements. */
export function useFreeviewTestSnapshot(trackId: string | null) {
  const [snapshot, setSnapshot] = useState<TestSnapshot | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV || Capacitor.isNativePlatform()) return;
    let previousSeconds: number | null = null;
    const update = () => {
      if (!developmentFreeview.enabled || developmentFreeview.subscribed) {
        setSnapshot(null); return;
      }
      const usage = playbackUsage.snapshot().secondsByTrack;
      const midpointExpirationTrackIds = new Set(developmentFreeview.midpointExpirationTrackIds());
      const exhausted = new Set(developmentFreeview.status().exhaustedTrackIds);
      for (const [id, seconds] of Object.entries(usage)) if (seconds >= 60) exhausted.add(id);
      const used = new Set(Object.entries(usage).filter(([, seconds]) => seconds > 0).map(([id]) => id));
      const countdownByTrack = Object.fromEntries(Object.entries(usage).filter(([, seconds]) => seconds > 0).map(([id, seconds]) => [id, formatFreeviewCountdown(seconds)]));
      const seconds = trackId ? usage[trackId] ?? 0 : 0;
      const isCountingDown = previousSeconds !== null && seconds > previousSeconds && seconds < 60;
      previousSeconds = seconds;
      const countdown = formatFreeviewCountdown(seconds);
      setSnapshot(previous => previous?.isCountingDown === isCountingDown && previous?.countdown === countdown &&
        [...midpointExpirationTrackIds].join() === [...previous.midpointExpirationTrackIds].join() &&
        [...exhausted].join() === [...previous.exhaustedTrackIds].join() &&
        [...used].join() === [...previous.usedTrackIds].join() &&
        JSON.stringify(countdownByTrack) === JSON.stringify(previous.countdownByTrack)
        ? previous : { midpointExpirationTrackIds, isCountingDown, countdown, exhaustedTrackIds: exhausted, usedTrackIds: used, countdownByTrack });
    };
    update();
    const remove = developmentFreeview.observe(update);
    // Read immediately after BFCache restoration / foreground return, too.
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => { remove(); window.removeEventListener("pageshow", update); document.removeEventListener("visibilitychange", update); };
  }, [trackId]);
  return snapshot;
}
/** Existing local adapter. Production/native policy is deliberately not connected. */
export function FreeviewTestBar({ snapshot, isPlaying, onSubscribe }: { snapshot: TestSnapshot; isPlaying: boolean; onSubscribe: () => void }) {
  if (!import.meta.env.DEV || Capacitor.isNativePlatform()) return null;
  return <FreeviewBar snapshot={snapshot} isPlaying={isPlaying} onSubscribe={onSubscribe} label="Development Freeview preview">
    <button className="eh-freeview-fresh-test" onClick={startFreshFreeviewTest}>Start fresh test</button>
  </FreeviewBar>;
}
