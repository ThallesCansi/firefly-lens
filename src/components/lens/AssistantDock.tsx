"use client";

import type { AssistantResponse, AssistantTurn, ChatTurn, ToolResult } from "@/lib/assistant/protocol";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { describeHost, runTool, type AssistantHost } from "@/lib/assistant/execute";

const EXAMPLES = [
  "Show Santa Catarina in 2006",
  "Which month burned most in the Pantanal?",
  "Compare Mato Grosso in 2020 and 2024",
];

/** The panel shows plain text: drop the Markdown emphasis some models add anyway. */
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2").replace(/^#+\s*/gm, "");

/** Model round trips allowed for one question. */
const MAX_STEPS = 8;

type Line = { kind: "user" | "assistant" | "action" | "error"; text: string };

async function step(turns: ChatTurn[]): Promise<AssistantTurn> {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turns }),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<AssistantResponse>;
  if (response.ok && "turn" in data && data.turn) return data.turn;
  throw new Error(("error" in data && data.error) || "The assistant is unavailable right now.");
}

/**
 * The map assistant. Questions go to /api/assistant; the tools Claude asks for
 * run here, against the workspace, and their results go back until it answers.
 */
export function AssistantDock({ host }: { host: RefObject<AssistantHost | null> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const conversation = useRef<ChatTurn[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [lines, busy, open]);

  const say = (line: Line) => setLines((all) => [...all, line]);

  async function ask(question: string) {
    const workspace = host.current;
    if (!workspace) return;
    setBusy(true);
    say({ kind: "user", text: question });
    const turns: ChatTurn[] = [
      ...conversation.current,
      { role: "user", text: `${describeHost(workspace)}\n\n${question}` },
    ];
    try {
      for (let n = 0; n < MAX_STEPS; n++) {
        // The model's turn is kept whole, so the server can replay it unchanged.
        const turn = await step(turns);
        turns.push(turn);
        if (turn.text) say({ kind: "assistant", text: plain(turn.text) });
        if (!turn.calls.length) break;
        const results: ToolResult[] = [];
        // In order: a later call (read the record) may depend on an earlier one (select the state).
        for (const call of turn.calls) {
          const outcome = await runTool(host.current ?? workspace, call.name, call.args);
          if (outcome.note) say({ kind: "action", text: outcome.note });
          results.push({ id: call.id, name: call.name, output: outcome.result, ok: outcome.ok });
        }
        turns.push({ role: "tool", results });
      }
      conversation.current = turns;
    } catch (error) {
      say({ kind: "error", text: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setOpen(true);
    void ask(q);
  };

  const reset = () => {
    conversation.current = [];
    setLines([]);
    input.current?.focus();
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
        <section id={panelId} className="assistant-panel map-surface" aria-label="FireFly assistant">
          <header className="assistant-panel-head">
            <span className="assistant-spark" aria-hidden="true" />
            <span>FireFly assistant</span>
            {lines.length > 0 && !busy && (
              <button type="button" className="assistant-reset" onClick={reset}>
                New conversation
              </button>
            )}
          </header>
          {lines.length ? (
            <div ref={thread} className="assistant-thread" aria-live="polite">
              {lines.map((line, i) =>
                line.kind === "action" ? (
                  <p key={i} className="assistant-action">
                    {line.text}
                  </p>
                ) : (
                  <p
                    key={i}
                    className={`assistant-bubble${line.kind === "user" ? " assistant-bubble-user" : ""}${
                      line.kind === "error" ? " assistant-bubble-error" : ""
                    }`}
                  >
                    {line.text}
                  </p>
                ),
              )}
              {busy && (
                <p className="assistant-bubble assistant-pending" role="status">
                  Thinking…
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="assistant-intro">
                Ask for a place and a time, and the map will take you there. Or ask about the fire record. Try one of
                these:
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
              <p className="assistant-privacy">
                Answers come from an AI model on a free service; questions are sent to that service. Don’t include
                personal details.
              </p>
            </>
          )}
        </section>
      )}
      <form className="assistant-bar map-surface" onSubmit={submit} role="search" aria-label="Ask the map assistant">
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
          maxLength={500}
        />
        <button type="submit" className="assistant-send" aria-label="Send" disabled={!text.trim() || busy}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
