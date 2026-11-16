/** Finish the scroll before Driver measures its next target; cancel on exit/back. */
export function scrollTourTo(top: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    const abort = () => {
      cancelAnimationFrame(frame);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    if (signal.aborted) { abort(); return; }
    const start = window.scrollY;
    const end = Math.max(0, Math.min(top, document.documentElement.scrollHeight - window.innerHeight));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(end - start) < 2) {
      window.scrollTo({ top: end, behavior: "instant" }); resolve(); return;
    }
    signal.addEventListener("abort", abort, { once: true });
    const began = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / 450);
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      window.scrollTo({ top: start + (end - start) * eased, behavior: "instant" });
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { signal.removeEventListener("abort", abort); resolve(); }
    };
    frame = requestAnimationFrame(tick);
  });
}
