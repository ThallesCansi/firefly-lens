"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import { TourFirefly } from "./TourFirefly";
import { PAGE_TOUR, TOUR_TOTAL, tourNumber, type TourPage } from "@/lib/onboarding/steps";
import { clearHandoff, readHandoff, writeHandoff, type TourHandoff } from "@/lib/onboarding/handoff";
import { readTourOptOut, saveTourOptOut, saveTourOutcome } from "@/lib/onboarding/persistence";
import "driver.js/dist/driver.css";
import "./LumeTour.css";

/** Where each page sends the tour next. */
const NEXT: Record<TourPage, { phase: TourHandoff["phase"]; href: string }> = {
  about: { phase: "method", href: "/method" },
  method: { phase: "complete", href: "/lens" },
};

/**
 * The tour's visit to About or Method. It runs only when the Lens tour handed
 * over to this page; FireFlighter flies in from where it was and points out a
 * few sections, then flies on. Leaving here ends the tour on this page, and
 * the Lens puts the saved workspace back on the next visit.
 */
export function PageTour({ page }: { page: TourPage }) {
  const router = useRouter();
  const [handoff, setHandoff] = useState<TourHandoff | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [index, setIndex] = useState(0);
  const [optOut, setOptOut] = useState(false);
  const flier = useRef<[number, number] | undefined>(undefined);
  const engine = useRef<Driver | null>(null);

  // Read in a frame, after hydration: the page renders the same with or without a tour.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const found = readHandoff([page]);
      if (!found) return;
      flier.current = found.from;
      setOptOut(readTourOptOut());
      setHandoff(found);
    });
    return () => cancelAnimationFrame(frame);
  }, [page]);

  useEffect(() => {
    if (!handoff) return;
    const steps = PAGE_TOUR[page];
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      saveTourOutcome("dismissed");
      // The workspace is put back when the Lens is opened again.
      writeHandoff({ phase: "restore", saved: handoff.saved });
      instance.destroy();
      setHandoff(null);
      setSlot(null);
    };
    const onward = () => {
      if (done) return;
      done = true;
      clearHandoff();
      writeHandoff({ phase: NEXT[page].phase, saved: handoff.saved, from: flier.current });
      instance.destroy();
      // The page may stay mounted (hidden) after navigating: its visit is over.
      setHandoff(null);
      setSlot(null);
      router.push(NEXT[page].href);
    };
    const instance = driver({
      steps: steps.map((step, i) => ({
        element: step.target,
        popover: {
          title: step.title,
          description: step.description,
          side: "bottom",
          align: "start",
          progressText: `${tourNumber({ page, index: i })} of ${TOUR_TOTAL}`,
          nextBtnText: i === steps.length - 1 ? (page === "about" ? "On to Method" : "Back to the Lens") : "Next",
          showButtons: i === 0 ? ["next", "close"] : ["previous", "next", "close"],
          onNextClick: () => { if (i === steps.length - 1) onward(); else instance.moveNext(); },
        },
      })),
      animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      smoothScroll: true, allowScroll: true, showProgress: true,
      overlayOpacity: 0.58, overlayClickBehavior: "none", stagePadding: 10, stageRadius: 12,
      popoverClass: "lume-tour-card", popoverOffset: 14, prevBtnText: "Back",
      closeBtnLabel: "Exit tour", onCloseClick: end,
      onPopoverRender: (popover) => {
        const mount = document.createElement("div");
        mount.className = "lume-tour-react";
        popover.wrapper.insertBefore(mount, popover.footer);
        setIndex(instance.getActiveIndex() ?? 0);
        setSlot(mount);
      },
      onDestroyed: end,
    });
    engine.current = instance;
    instance.drive();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); end(); }
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("keydown", escape, true);
      done = true;
      instance.destroy();
      engine.current = null;
    };
  }, [handoff, page, router]);

  if (!handoff) return null;
  return <>
    <TourFirefly from={handoff.from} onPosition={(at) => { flier.current = at; }} />
    {slot && createPortal(<>
      <div className="lume-tour-mascot" aria-hidden="true" />
      <span className="lume-tour-signature">FIREFLIGHTER · YOUR GUIDE</span>
      {index === 0 && <label className="lume-tour-opt-out"><input type="checkbox" checked={optOut} onChange={(event) => {
        setOptOut(event.target.checked); saveTourOptOut(event.target.checked);
      }} />Don&apos;t show again</label>}
      <div className="lume-tour-actions">
        <button type="button" className="lume-tour-skip" onClick={() => engine.current?.destroy()}>Skip tour</button>
      </div>
    </>, slot)}
  </>;
}
