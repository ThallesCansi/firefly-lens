"use client";
import { useId, useRef, useState, type ComponentProps, type ReactNode } from "react";

/** Full cards on a roomy map; keyboard-accessible disclosures on a narrow one. */
export function MapDisclosure({ kind, summary, children, ...props }: Omit<ComponentProps<"section">,"className"> & {
  kind: "selection-card" | "map-key"; summary: ReactNode;
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
    <button ref={trigger} type="button" className={`${kind}-chip`} aria-expanded={open} aria-controls={id}
      onClick={()=>setOpen(value=>!value)}>
      <span>{summary}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <div id={id} className={`${kind}-body`}>{children}</div>
  </section>;
}
