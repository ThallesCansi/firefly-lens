/** Supplement inert with scoped event gating for global shortcuts and native
 * wheel/touch gestures. Driver's body portal remains fully interactive.
 * Programmatic state changes, scrollIntoView and geometry measurements are untouched.
 */
export function lockTourInteractions(): () => void {
  const block = (event: Event) => {
    const inside = event.composedPath().some((node) => node instanceof Element && node.matches(".lume-tour-card"));
    if (event instanceof KeyboardEvent) {
      // Preserve browser reload/devtools shortcuts and Driver navigation.
      if (event.ctrlKey || event.metaKey || /^F\d{1,2}$/.test(event.key) || event.key === "Escape") return;
      if ((inside || document.querySelector(".lume-tour-card")) && ["Tab", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      if (inside && ["Enter", " "].includes(event.key)) return;
    } else if (inside) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };
  const events = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick", "contextmenu", "touchstart", "touchmove", "touchend", "wheel", "keydown", "keyup", "beforeinput"];
  for (const type of events) window.addEventListener(type, block, { capture: true, passive: false });
  return () => { for (const type of events) window.removeEventListener(type, block, true); };
}
