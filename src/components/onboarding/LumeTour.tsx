"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Driver } from "driver.js";
import { TourFirefly } from "./TourFirefly";
import { writeHandoff } from "@/lib/onboarding/handoff";
import { TourSession, type TourWorkspace } from "@/lib/onboarding/session";
import { createTourDriver } from "@/lib/onboarding/driver-adapter";
import { TOUR_STEPS } from "@/lib/onboarding/steps";
import { readTourOptOut, saveTourOptOut, saveTourOutcome } from "@/lib/onboarding/persistence";
import "driver.js/dist/driver.css";
import "./LumeTour.css";

export default function LumeTour({ workspace, onExit, startAt = 0, from }: {
  workspace: TourWorkspace;
  onExit: () => void;
  /** Step to open on: the last one, when the tour comes back from About and Method. */
  startAt?: number;
  /** Where the firefly was on the previous page. */
  from?: [number, number];
}) {
  const router = useRouter();
  const flier = useRef<[number, number] | undefined>(from);
  const [session] = useState(() => new TourSession(workspace));
  useLayoutEffect(() => { session.setWorkspace(workspace); }, [session, workspace]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const [engine, setEngine] = useState<Driver | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [optOut, setOptOut] = useState(() => readTourOptOut());
  const exit = useRef<(keep: boolean, completed: boolean) => void>(() => {});
  const finished = useRef(false);
  const exitCallback = useRef(onExit);
  useLayoutEffect(() => { exitCallback.current = onExit; });
  const begin = useRef(startAt);
  // Next on "pages": the saved workspace and the firefly travel on to About.
  const leave = useRef(() => {});
  useLayoutEffect(() => {
    leave.current = () => {
      const saved = session.detach();
      if (!saved) return;
      finished.current = true;
      writeHandoff({ phase: "about", saved, from: flier.current });
      // The Lens may stay mounted (hidden) while away: its tour ends here, so
      // coming back resumes from the hand-off instead of a stale session.
      exitCallback.current();
      router.push("/about");
    };
  });
  useEffect(() => {
    finished.current = false;
    let closing = false;
    const instance = createTourDriver(session, {
      close: () => { if (!closing && !finished.current) exit.current(false, false); },
      leave: () => leave.current(),
      render: (popover) => {
        const mount = document.createElement("div");
        mount.className = "lume-tour-react";
        popover.wrapper.insertBefore(mount, popover.footer);
        popover.wrapper.dataset.tourStep = TOUR_STEPS[session.snapshot().index].id;
        setSlot(mount);
      },
    });
    exit.current = (keep, completed) => {
      if (finished.current) return;
      finished.current = true;
      closing = true;
      saveTourOutcome(completed ? session.snapshot().skipped.length ? "partial" : "completed" : "dismissed");
      session.finish(keep);
      instance.destroy();
      exitCallback.current();
    };
    setEngine(instance);
    void session.start(begin.current);
    const refresh = () => instance.refresh();
    window.visualViewport?.addEventListener("resize", refresh);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const changeMotion = () => instance.setConfig({ ...instance.getConfig(), animate: !motion.matches });
    motion.addEventListener("change", changeMotion);
    // Escape always exits the read-only demonstration; no workspace widget owns focus.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation();
      exit.current(false, false);
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      closing = true;
      window.visualViewport?.removeEventListener("resize", refresh);
      motion.removeEventListener("change", changeMotion);
      window.removeEventListener("keydown", escape, true);
      instance.destroy();
      session.dispose();
    };
  }, [session]);
  useEffect(() => {
    if (!engine) return;
    if (state.phase === "ready") engine.drive(state.index);
    if (state.phase === "preparing") engine.updatePopover({ disableButtons: ["next"] });
    if (state.phase === "error") engine.highlight({
      popover: { title: "Let’s try another way", description: state.error ?? "This section could not be opened.", showButtons: ["close"] },
    });
  }, [engine, state.phase, state.index, state.error]);
  useLayoutEffect(() => { if (slot) engine?.refresh(); }, [engine, slot, state.phase]);
  const done = state.index === TOUR_STEPS.length - 1;
  return <>
    <TourFirefly mood={state.phase === "error" ? "alert" : "idle"} from={from} onPosition={(at) => { flier.current = at; }} />
    {slot && createPortal(<>
    <div className="lume-tour-mascot" aria-hidden="true" />
    <span className="lume-tour-signature">FIREFLIGHTER · YOUR GUIDE</span>
    <label className="lume-tour-opt-out"><input type="checkbox" checked={optOut} onChange={(event) => {
      const disabled = event.target.checked;
      setOptOut(disabled); saveTourOptOut(disabled);
    }} />Don&apos;t show again</label>
    <div className="lume-tour-actions">
      {state.phase === "error" ? <>
        <button type="button" onClick={() => { void session.retry(); }}>Retry section</button>
        <button type="button" onClick={() => { void session.skipSection(); }}>Skip section</button>
      </> : done ? <>
        {state.skipped.length > 0 && <p>Some sections were unavailable or skipped. You can replay them later.</p>}
        <button type="button" className="lume-tour-primary" onClick={() => exit.current(true, true)}>Keep example</button>
        <button type="button" onClick={() => exit.current(false, true)}>Restore previous workspace</button>
        <button type="button" onClick={() => { void session.start(); }}>Replay tour</button>
      </> : null}
      {!done && <button type="button" className="lume-tour-skip" onClick={() => exit.current(false, false)}>Skip tour</button>}
    </div>
  </>, slot)}
  </>;
}
