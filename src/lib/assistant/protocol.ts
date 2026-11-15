/**
 * The assistant's conversation, independent of the model provider. The
 * browser keeps it; the server turns it into each provider's own format.
 */

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  /** What the model reads: a sentence or a JSON string. */
  output: string;
  ok: boolean;
}

export interface AssistantTurn {
  role: "assistant";
  text: string;
  calls: ToolCall[];
  /** The provider that wrote the turn, and its turn as it came, to replay unchanged (Gemini's thought signatures). */
  provider: string;
  raw?: unknown;
}

export type ChatTurn =
  | { role: "user"; text: string }
  | AssistantTurn
  | { role: "tool"; results: ToolResult[] };

/** What /api/assistant answers. */
export type AssistantResponse = { turn: AssistantTurn } | { error: string };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Checks a conversation sent by the browser. */
export function validTurns(turns: unknown): turns is ChatTurn[] {
  if (!Array.isArray(turns) || !turns.length || !isRecord(turns[0]) || turns[0].role !== "user") return false;
  return turns.every((t) => {
    if (!isRecord(t)) return false;
    if (t.role === "user") return typeof t.text === "string";
    if (t.role === "assistant")
      return (
        typeof t.text === "string" &&
        typeof t.provider === "string" &&
        Array.isArray(t.calls) &&
        t.calls.every((c) => isRecord(c) && typeof c.id === "string" && typeof c.name === "string" && isRecord(c.args))
      );
    if (t.role === "tool")
      return (
        Array.isArray(t.results) &&
        t.results.every(
          (r) => isRecord(r) && typeof r.id === "string" && typeof r.name === "string" && typeof r.output === "string",
        )
      );
    return false;
  });
}
