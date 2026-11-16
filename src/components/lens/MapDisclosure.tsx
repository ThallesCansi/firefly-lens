"use client";
import { useId, useRef, useState, type ComponentProps, type ReactNode } from "react";

/** Secondary details fold everywhere; an optional primary action stays visible. */
export function MapDisclosure({ kind, summary, primaryAction, children, ...props }: Omit<ComponentProps<"section">,"className"> & {
  kind: "selection-card" | "map-key"; summary: ReactNode; primaryAction?: ReactNode;
}) {
  const [open,setOpen]=useState(false);
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  return <section {...props} className={`${kind} map-surface`} data-open={open}
    onKeyDown={event=>{
      if(event.key==="Escape" && open) {
        event.stopPropagation();setOpen(false);trigger.current?.focus();
      }
    }}>
    <div className="map-disclosure-header">
    <button ref={trigger} type="button" className={`${kind}-chip`} aria-expanded={open} aria-controls={id}
      onClick={()=>setOpen(value=>!value)}>
      <span>{summary}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {primaryAction && <div className="map-disclosure-primary">{primaryAction}</div>}
    </div>
    <div id={id} className={`${kind}-body`}>{children}</div>
  </section>;
}
