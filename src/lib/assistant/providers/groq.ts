import Groq from "groq-sdk";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import type { AssistantTurn, ChatTurn } from "../protocol";
import type { ToolSpec } from "../tools";
import { parseArgs, ProviderError, type Provider, type ProviderRequest } from "./types";

const NO_PARAMETERS = { type: "object", properties: {}, additionalProperties: false };

function tools(specs: ToolSpec[]): ChatCompletionTool[] {
  return specs.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters ?? NO_PARAMETERS },
  }));
}

function messages(system: string, turns: ChatTurn[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") out.push({ role: "user", content: turn.text });
    else if (turn.role === "assistant")
      out.push({
        role: "assistant",
        content: turn.text || null,
        ...(turn.calls.length
          ? {
              tool_calls: turn.calls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      });
    else
      for (const r of turn.results)
        out.push({ role: "tool", tool_call_id: r.id, content: r.ok ? r.output : `Error: ${r.output}` });
  }
  return out;
}

/**
 * Groq's OpenAI-compatible chat API (open models such as gpt-oss and Qwen).
 * `models` is tried in order: Groq's free limits are per model and per minute,
 * so when one model is out of tokens the next one answers.
 */
export function groqProvider(apiKey: string, models: string[]): Provider {
  const client = new Groq({ apiKey, maxRetries: 0 });
  return {
    name: "groq",
    model: models.join(", "),
    async reply(request): Promise<AssistantTurn> {
      for (let i = 0; i < models.length; i++) {
        const last = i === models.length - 1;
        try {
          return await complete(client, models[i], request, last);
        } catch (error) {
          // Out of quota: on to the next model, if there is one.
          if (!(error instanceof Groq.RateLimitError) || last) throw sorted(error);
        }
      }
      throw new ProviderError("unavailable", "No Groq model configured.");
    },
  };
}

async function complete(
  client: Groq,
  model: string,
  { system, tools: specs, turns, signal }: ProviderRequest,
  last: boolean,
): Promise<AssistantTurn> {
  const completion = await client.chat.completions.create(
    {
      model,
      messages: messages(system, turns),
      tools: tools(specs),
      tool_choice: "auto",
      temperature: 0.2,
      // Free models cap output tokens per minute (1,000 on some), and this counts against it.
      max_completion_tokens: 900,
      // gpt-oss reasons briefly; reasoning stays on the server either way.
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" as const } : {}),
      reasoning_format: "hidden",
    },
    // The last model waits out a short per-minute limit (the SDK honours Retry-After).
    { signal, maxRetries: last ? 2 : 0 },
  );
  const message = completion.choices[0]?.message;
  if (!message) throw new ProviderError("unavailable", "The model returned nothing.");
  return {
    role: "assistant",
    provider: "groq",
    text: message.content?.trim() ?? "",
    calls: (message.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      args: parseArgs(c.function.arguments),
    })),
  };
}

/** Groq's errors, sorted into what the person should be told. */
function sorted(error: unknown): unknown {
  if (error instanceof ProviderError) return error;
  if (error instanceof Groq.RateLimitError) return new ProviderError("quota", error.message);
  if (error instanceof Groq.AuthenticationError || error instanceof Groq.PermissionDeniedError)
    return new ProviderError("refused", error.message);
  if (error instanceof Groq.APIConnectionTimeoutError || error instanceof Groq.APIUserAbortError)
    return new ProviderError("timeout", error.message);
  if (error instanceof Groq.BadRequestError) return new ProviderError("refused", error.message);
  if (error instanceof Groq.APIError) return new ProviderError("unavailable", error.message);
  return error;
}
