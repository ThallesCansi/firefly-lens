"use client";
import { useId, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { Lume } from "@/components/firefly/Lume";

export function TourLauncher({onStart,disabled,ref}:{onStart:()=>void;disabled:boolean;ref?:Ref<HTMLButtonElement>}) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  useImperativeHandle(ref,()=>trigger.current!);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      if(!popup.current||!trigger.current)return;
      const r=trigger.current.getBoundingClientRect();const width=Math.min(240,innerWidth-24);
      Object.assign(popup.current.style,{width:`${width}px`,left:`${Math.max(12,Math.min(innerWidth-width-12,r.right-width))}px`,top:`${Math.max(12,r.top-popup.current.offsetHeight-10)}px`});
    };
    if(disabled){popup.current?.hidePopover();return;}
    place();window.addEventListener("resize",place);window.visualViewport?.addEventListener("resize",place);
    return()=>{window.removeEventListener("resize",place);window.visualViewport?.removeEventListener("resize",place);};
  },[open,disabled]);
  return <>
    <button ref={trigger} data-tour="replay" type="button" className="lume-replay map-surface"
      aria-label="Tour with FireFlighter" aria-expanded={open} aria-controls={id} disabled={disabled}
      onClick={()=>{if(matchMedia("(max-width:700px)").matches)popup.current?.togglePopover();else onStart();}}>
      <Lume size={24}/><span className="lume-replay-label">Tour with FireFlighter</span>
    </button>
    <div ref={popup} id={id} popover="auto" className="lume-tour-intro map-surface" role="group" aria-label="Tour with Lume"
      onToggle={event=>setOpen((event.nativeEvent as ToggleEvent).newState==="open")}
      onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();popup.current?.hidePopover();trigger.current?.focus();}}}>
      <strong>Tour with Lume</strong><p>A guided introduction to the map and its analyses.</p>
      <button type="button" className="btn btn-primary" onClick={()=>{popup.current?.hidePopover();onStart();}}>Start tour</button>
    </div>
  </>;
}
