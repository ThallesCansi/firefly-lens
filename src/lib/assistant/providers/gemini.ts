import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import type { AssistantTurn, ChatTurn } from "../protocol";
import { ProviderError, type Provider } from "./types";

function contents(turns: ChatTurn[]): Content[] {
  return turns.map((turn): Content => {
    if (turn.role === "user") return { role: "user", parts: [{ text: turn.text }] };
    if (turn.role === "assistant") {
      // Gemini's own turns go back whole, so its thought signatures survive.
      if (turn.provider === "gemini" && turn.raw) return turn.raw as Content;
      const parts: Part[] = [];
      if (turn.text) parts.push({ text: turn.text });
      for (const c of turn.calls) parts.push({ functionCall: { id: c.id, name: c.name, args: c.args } });
      return { role: "model", parts };
    }
    return {
      role: "user",
      parts: turn.results.map((r) => ({
        functionResponse: { id: r.id, name: r.name, response: r.ok ? { output: r.output } : { error: r.output } },
      })),
    };
  });
}

/** The Gemini API, through Google's Gen AI SDK. */
export function geminiProvider(apiKey: string, model: string): Provider {
  const client = new GoogleGenAI({ apiKey });
  return {
    name: "gemini",
    model,
    async reply({ system, tools, turns, signal }): Promise<AssistantTurn> {
      try {
        const response = await client.models.generateContent({
          model,
          contents: contents(turns),
          config: {
            systemInstruction: system,
            tools: [
              {
                functionDeclarations: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  ...(t.parameters ? { parametersJsonSchema: t.parameters } : {}),
                })),
              },
            ],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            abortSignal: signal,
          },
        });
        const parts = response.candidates?.[0]?.content?.parts;
        if (!parts?.length) throw new ProviderError("unavailable", "The model returned nothing.");
        return {
          role: "assistant",
          provider: "gemini",
          raw: { role: "model", parts },
          text: parts
            .filter((p) => p.text && !p.thought)
            .map((p) => p.text!.trim())
            .join("\n")
            .trim(),
          calls: parts.flatMap((p, i) =>
            p.functionCall?.name
              ? [{ id: p.functionCall.id ?? `call-${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} }]
              : [],
          ),
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (error instanceof ApiError) {
          if (error.status === 429) throw new ProviderError("quota", error.message);
          if (error.status === 400 || error.status === 403) throw new ProviderError("refused", error.message);
          throw new ProviderError("unavailable", error.message);
        }
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
          throw new ProviderError("timeout", error.message);
        throw error;
      }
    },
  };
}
