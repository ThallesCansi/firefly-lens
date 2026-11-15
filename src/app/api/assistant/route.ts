import { meta } from "@/lib/data/meta";
import { validTurns, type AssistantResponse } from "@/lib/assistant/protocol";
import { ASSISTANT_TOOLS } from "@/lib/assistant/tools";
import { geminiProvider } from "@/lib/assistant/providers/gemini";
import { groqProvider } from "@/lib/assistant/providers/groq";
import { ProviderError, type Provider } from "@/lib/assistant/providers/types";

/**
 * The map assistant's model call. The browser keeps the conversation and runs
 * the tools; this route holds the API key and forwards one turn at a time to
 * the configured provider.
 *
 * ASSISTANT_PROVIDER picks "groq" or "gemini"; without it, the first one with
 * a key (GROQ_API_KEY, then GEMINI_API_KEY). GROQ_MODELS (comma-separated,
 * tried in order) and GEMINI_MODEL override the models.
 */

const MAX_BODY = 400_000;
const MAX_TURNS = 80;

const SYSTEM = `You are the assistant inside FireFly Lens, a web map of fire activity in Brazil built from NASA FIRMS hot spots.

The record: MODIS on Aqua from ${meta.firstDay} and VIIRS on NOAA-20 from ${meta.viirsStart}, to ${meta.lastDay}, counted on a 0.25° grid and harmonized to the MODIS Aqua scale. From ${meta.observedUntil + 1} the series is VIIRS converted to that scale by a model. Hot spots are detected pixels, not individual fires. Only Brazil is covered. An area of interest is a Brazilian state, a ready-made region, or a rectangle at most 12° a side; the whole country is too large.

How to help:
- Always answer in the language of the person's latest message: English for English, Portuguese for Portuguese.
- Turn requests into map actions with the tools. When a request names a place and a time, pass both in one call: "Show Santa Catarina in 2006" is select_state with state "Santa Catarina" and period "2006" (a bare year shows that year's busiest month). With a time and no new place, call set_period.
- Never say the map shows a period, place or layer you did not set with a tool.
- For questions about amounts, peaks, trends or comparisons, select the area, call get_fire_history and answer from what it returns. Never state a number you did not read from a tool.
- Open the analysis only when the person asks for the analysis, the calendar or the report.
- Each user message starts with the map's current state in <map_state>.
- Keep replies to two or three short sentences, in plain text without Markdown. Give months by name. The unit is hot spots ("focos de calor" when answering in Portuguese), never fires.
- Do not restate what the person can already see ("X is now selected"); say what the record shows.
- If something is outside the record (another country, a date before ${meta.firstDay} or after ${meta.lastDay}), say so plainly.`;

function configuredProvider(): Provider | null {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const choice = process.env.ASSISTANT_PROVIDER || (groqKey ? "groq" : geminiKey ? "gemini" : "");
  if (choice === "groq" && groqKey)
    return groqProvider(
      groqKey,
      (process.env.GROQ_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b").split(",").map((m) => m.trim()).filter(Boolean),
    );
  if (choice === "gemini" && geminiKey) return geminiProvider(geminiKey, process.env.GEMINI_MODEL || "gemini-3.6-flash");
  return null;
}

let provider: Provider | null | undefined;

/** A few requests per minute per address, to stay inside free quotas. */
const recent = new Map<string, number[]>();
function limited(address: string): boolean {
  const now = Date.now();
  const hits = (recent.get(address) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(address, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > 20;
}

const answer = (body: AssistantResponse, status = 200) => Response.json(body, { status });

const MESSAGES: Record<ProviderError["kind"], [string, number]> = {
  quota: ["The assistant is busy or out of free quota. Try again in a minute.", 429],
  refused: ["The model refused the request. Check the API key, or start a new conversation.", 400],
  timeout: ["The model took too long to answer. Try again in a moment.", 504],
  unavailable: ["The assistant is unavailable right now.", 502],
};

export async function POST(request: Request) {
  if (provider === undefined) provider = configuredProvider();
  if (!provider)
    return answer({ error: "The assistant is not configured. Set GROQ_API_KEY or GEMINI_API_KEY on the server." }, 503);
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(address)) return answer({ error: "Too many questions in a minute. Wait a moment and ask again." }, 429);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return answer({ error: "The conversation is too long. Start a new one." }, 413);
  let turns: unknown;
  try {
    turns = (JSON.parse(raw) as { turns?: unknown }).turns;
  } catch {
    return answer({ error: "Malformed request." }, 400);
  }
  if (!validTurns(turns) || turns.length > MAX_TURNS) return answer({ error: "Malformed conversation." }, 400);

  try {
    const turn = await provider.reply({
      system: SYSTEM,
      tools: ASSISTANT_TOOLS,
      turns,
      signal: AbortSignal.timeout(45_000),
    });
    if (!turn.text && !turn.calls.length) return answer({ error: "I couldn’t answer that one. Try asking another way." }, 422);
    return answer({ turn });
  } catch (error) {
    if (error instanceof ProviderError) {
      console.error(`assistant (${provider.name} ${provider.model}): ${error.kind}:`, error.message);
      const [message, status] = MESSAGES[error.kind];
      return answer({ error: message }, status);
    }
    console.error(`assistant (${provider.name} ${provider.model}):`, error);
    return answer({ error: MESSAGES.unavailable[0] }, 502);
  }
}
