import type { AssistantTurn, ChatTurn } from "../protocol";
import type { ToolSpec } from "../tools";

export interface ProviderRequest {
  system: string;
  tools: ToolSpec[];
  turns: ChatTurn[];
  signal: AbortSignal;
}

/** One model provider: takes the conversation, returns the model's next turn. */
export interface Provider {
  name: string;
  model: string;
  reply(request: ProviderRequest): Promise<AssistantTurn>;
}

/** A provider failure, already sorted into what the person should be told. */
export class ProviderError extends Error {
  constructor(
    readonly kind: "quota" | "refused" | "timeout" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

/** Parses a tool call's JSON arguments; models sometimes send an empty string. */
export function parseArgs(json: string | undefined | null): Record<string, unknown> {
  if (!json?.trim()) return {};
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
