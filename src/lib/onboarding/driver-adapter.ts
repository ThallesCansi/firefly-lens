import { driver, type DriveStep, type PopoverDOM } from "driver.js";
import { TOUR_STEPS, type TourStep } from "./steps";
import type { TourSession } from "./session";

const readiness = new Set(["history", "month", "analytics-history", "analytics-forecast", "exports"]);
export function targetSelector(target: string) {
  return `[data-tour="${target}"]${readiness.has(target) ? '[data-tour-ready="true"]' : ""}`;
}

export function createTourDriver(session: TourSession, options: {
  render(popover: PopoverDOM): void;
  close(): void;
}) {
  const steps: DriveStep[] = TOUR_STEPS.map((definition: TourStep, index) => ({
    element: definition.target ? targetSelector(definition.target) : undefined,
    disableActiveInteraction: !definition.interactive,
    allowedElements: definition.id === "map" ? '[data-tour="map-canvas"]' : undefined,
    // Native waiting handles React-mounted targets. Readiness attributes are
    // set by the component that actually owns the correct region's data.
    waitForElement: 12000,
    waitForRemovedElement: 12000,
    popover: {
      title: definition.title, description: definition.description,
      side: "bottom", align: "center",
      nextBtnText: definition.id === "welcome" ? "Start tour" : "Next",
      showButtons: definition.id === "complete" ? ["close"] : index === 0 ? ["next", "close"] : ["previous", "next", "close"],
      onNextClick: () => { void session.go(index + 1); },
      onPrevClick: () => { void session.go(index - 1); },
    },
    onInteraction: (_element, _step, { event, region }) => {
      if (definition.id === "analyze" && region === "element" && event.type === "click")
        queueMicrotask(() => { if (session.snapshot().index === index) void session.go(index + 1); });
    },
    onElementMissing: (_element, _step, { cause }) => {
      if (session.snapshot().phase !== "ready" || session.snapshot().index !== index) return false;
      if (definition.id === "analyze" && cause === "removed") void session.go(index + 1);
      else session.fail("This section is not ready. Its controls or data could not be loaded. You can retry, skip the section, or exit and restore your workspace.");
      return false;
    },
  }));
  return driver({
    steps, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    duration: 220, smoothScroll: false, allowScroll: true,
    overlayOpacity: 0.58, overlayClickBehavior: "none", stagePadding: 7, stageRadius: 12,
    popoverClass: "lume-tour-card", popoverOffset: 14,
    showProgress: true, progressText: "{{current}} of {{total}}", prevBtnText: "Back",
    closeBtnLabel: "Exit tour and restore workspace", onCloseClick: options.close,
    onPopoverRender: options.render,
    onDestroyed: options.close,
  });
}
