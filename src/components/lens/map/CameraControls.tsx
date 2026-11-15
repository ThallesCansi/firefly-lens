"use client";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CameraProfile } from "@/lib/map/map-contract";
import type { CameraAction } from "@/lib/map/camera-presets";
import { placeCameraPopover } from "@/lib/map/camera-popover";

export function CameraControls({ profile, onProfile, onAction, onStop, running, disabled, hasSelection, globeAvailable, terrainControl, imageryControl }: {
  profile: CameraProfile; onProfile(profile: CameraProfile): void; onAction(action: CameraAction): void;
  onStop(): void; running: boolean; disabled: boolean; hasSelection: boolean; globeAvailable: boolean;
  terrainControl?: ReactNode;
  imageryControl?: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const element = popup.current;
    if (!open || !element) return;
    if (disabled) { element.hidePopover(); return; }
    const place = () => {
      if (!trigger.current || !element.matches(":popover-open")) return;
      const view = window.visualViewport;
      const left = view?.offsetLeft ?? 0, top = view?.offsetTop ?? 0;
      element.style.maxHeight = "none";
      const root = trigger.current.closest(".lens-workspace") ?? document;
      const obstacles = [...root.querySelectorAll<HTMLElement>(".map-card, .map-highlights, .selection-card, .explore-hint, .map-toolbar, .map-site-card, .map-key, .map-bottom, .map-view-controls, .analysis-drawer, .ff-interaction-panel, .lume-replay, [data-tour=search], .coordinates-panel, .ff-workspace-tools-card")]
        .filter((e) => getComputedStyle(e).visibility !== "hidden").map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
      const placed = placeCameraPopover(trigger.current.getBoundingClientRect(),
        { width: Math.min(280, Math.max(188, (view?.width ?? innerWidth) - 96)), height: element.scrollHeight },
        { left, top, right: left + (view?.width ?? innerWidth), bottom: top + (view?.height ?? innerHeight) }, obstacles);
      Object.assign(element.style, { left: `${placed.left}px`, top: `${placed.top}px`, width: `${placed.width}px`, maxHeight: `${placed.maxHeight}px` });
    };
    place(); element.querySelector("select")?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    const observer = new ResizeObserver(place);
    const workspace = trigger.current?.closest(".workspace-map");
    if (workspace) observer.observe(workspace);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); };
  }, [open, disabled]);
  return <div className="camera-control map-surface">
    <button ref={trigger} type="button" className="camera-trigger" aria-label="Camera controls" aria-expanded={open}
      popoverTarget={id} disabled={disabled}>Camera</button>
    <div ref={popup} id={id} popover="auto" className="camera-menu" role="group" aria-label="Camera controls"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); popup.current?.hidePopover(); trigger.current?.focus({ preventScroll: true });
        }
      }}
      onToggle={(event) => setOpen((event.nativeEvent as ToggleEvent).newState === "open")}>
      <label className="camera-profile-label">Profile<select aria-label="Camera profile" value={profile} disabled={disabled}
        onChange={(event) => onProfile(event.target.value as CameraProfile)}>
        <option value="standard">Standard</option><option value="cinematic">Cinematic</option>
      </select></label>
      <p>{profile === "standard" ? "Standard keeps traditional navigation." : "Cinematic styles future automatic flights."} Switching profiles stays put. Imagery and scientific data stay unchanged.</p>
      <fieldset><legend>Focus</legend><div className="camera-action-grid">{([
        ["earth", "Earth overview"], ["brazil", "Focus Brazil"], ["pantanal", "Focus Pantanal"],
        ["selected", "Frame selected area"],
      ] as const).map(([action, label]) => <button key={action} type="button"
        disabled={disabled || (action === "selected" && !hasSelection) || (action === "earth" && !globeAvailable)}
        onClick={() => onAction(action)}>{label}</button>)}</div></fieldset>
      <fieldset><legend>Orientation</legend><div className="camera-action-grid">
        <button type="button" disabled={disabled} onClick={() => onAction("north")}>North up</button>
        <button type="button" disabled={disabled} onClick={() => onAction("top")}>Top-down</button>
      </div></fieldset>
      {imageryControl}
      {terrainControl}
      <button className="camera-stop" type="button" disabled={disabled || !running} onClick={onStop}>Stop flight</button>
      <span role="status" aria-live="polite">{running ? "Camera moving. Gestures stop the flight." : "Camera ready"}</span>
    </div>
  </div>;
}
