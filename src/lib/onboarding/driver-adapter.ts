import { driver, type DriveStep, type PopoverDOM } from "driver.js";
import { TOUR_STEPS, TOUR_TOTAL, tourNumber, type TourStep } from "./steps";
import type { TourSession } from "./session";

const readiness = new Set(["history", "month", "analytics-history", "analytics-forecast", "exports"]);
export function targetSelector(target: string) {
  return `[data-tour="${target}"]${readiness.has(target) ? '[data-tour-ready="true"]' : ""}`;
}

export function createTourDriver(session: TourSession, options: {
  render(popover: PopoverDOM): void;
  close(): void;
  /** Next on the "pages" step: the tour goes on to the About and Method pages. */
  leave?(): void;
}) {
  const steps: DriveStep[] = TOUR_STEPS.map((definition: TourStep, index) => ({
    element: definition.target ? targetSelector(definition.target) : undefined,
    disableActiveInteraction: true,
    allowPageInteraction: false,
    focus: "popover",
    // Native waiting handles React-mounted targets. Readiness attributes are
    // set by the component that actually owns the correct region's data.
    waitForElement: 12000,
    waitForRemovedElement: 12000,
    popover: {
      title: definition.title, description: definition.description,
      side: "bottom", align: "center",
      nextBtnText: definition.id === "welcome" ? "Start tour" : "Next",
      showButtons: definition.id === "complete" ? ["close"] : index === 0 ? ["next", "close"] : ["previous", "next", "close"],
      // The count includes the stops on About and Method, visited before the last step.
      progressText: `${tourNumber({ lens: index })} of ${TOUR_TOTAL}`,
      onNextClick: () => { if (definition.id === "pages" && options.leave) options.leave(); else void session.go(index + 1); },
      onPrevClick: () => { void session.go(index - 1); },
    },
    onElementMissing: () => {
      if (session.snapshot().phase !== "ready" || session.snapshot().index !== index) return false;
      session.fail("This section is not ready. Its controls or data could not be loaded. You can retry, skip the section, or exit and restore your workspace.");
      return false;
    },
  }));
  return driver({
    steps, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    duration: 220, smoothScroll: false, allowScroll: true,
    disableActiveInteraction: true, allowPageInteraction: false, focus: "popover",
    overlayOpacity: 0.58, overlayClickBehavior: "none", stagePadding: 7, stageRadius: 12,
    popoverClass: "lume-tour-card", popoverOffset: 14,
    showProgress: true, progressText: "{{current}} of {{total}}", prevBtnText: "Back",
    closeBtnLabel: "Exit tour and restore workspace", onCloseClick: options.close,
    onPopoverRender: options.render,
    onDestroyed: options.close,
  });
}
