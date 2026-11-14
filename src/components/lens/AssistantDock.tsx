"use client";

import { useEffect, useId, useRef, useState } from "react";

const EXAMPLES = [
  "Show Santa Catarina in 2006",
  "Which month burned most in the Pantanal?",
  "Compare Mato Grosso in 2020 and 2024",
];

/**
 * Design preview of the map assistant. It will turn requests such as "Show
 * Santa Catarina in 2006" into map actions. Nothing is sent anywhere yet: a
 * question gets a clear "not connected yet" reply.
 */
export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setAsked(q);
    setText("");
    setOpen(true);
  };

  return (
    <div
      ref={root}
      className="assistant-dock"
      data-open={open}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          input.current?.blur();
        }
      }}
    >
      {open && (
        <section id={panelId} className="assistant-panel map-surface" aria-label="Assistant preview">
          <header className="assistant-panel-head">
            <span className="assistant-spark" aria-hidden="true" />
            <span>FireFly assistant</span>
            <span className="assistant-badge">Preview</span>
          </header>
          {asked ? (
            <div className="assistant-thread" aria-live="polite">
              <p className="assistant-bubble assistant-bubble-user">{asked}</p>
              <p className="assistant-bubble">
                I can&rsquo;t act on this yet: the assistant is a design preview. Soon I&rsquo;ll move the map, set the
                period and open the analysis for you. For now, use the tools on the left.
              </p>
            </div>
          ) : (
            <>
              <p className="assistant-intro">
                Ask for a place and a time, and the map will take you there. Coming soon. Try one of these:
              </p>
              <div className="assistant-examples">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setText(ex);
                      input.current?.focus();
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      <form className="assistant-bar map-surface" onSubmit={submit} role="search" aria-label="Ask the map assistant (preview)">
        <span className="assistant-spark" aria-hidden="true" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Ask FireFly… “Show Santa Catarina in 2006”"
          aria-label="Ask the map assistant"
          aria-describedby={open ? panelId : undefined}
          autoComplete="off"
        />
        <span className="assistant-badge assistant-badge-inline">Preview</span>
        <button type="submit" className="assistant-send" aria-label="Send" disabled={!text.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
