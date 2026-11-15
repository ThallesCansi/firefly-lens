import { ApiError, GoogleGenAI, ThinkingLevel, type Content } from "@google/genai";
import { meta } from "@/lib/data/meta";
import { ASSISTANT_TOOLS } from "@/lib/assistant/tools";

/**
 * The map assistant's model call, on the Gemini API. The browser keeps the
 * conversation and runs the tools; this route holds the API key and forwards
 * one turn at a time.
 */

// gemini-3.8-flash hung for minutes on the free tier (November 2026); 3.6 answers in seconds.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const MAX_BODY = 400_000;
const MAX_MESSAGES = 80;

const SYSTEM = `You are the assistant inside FireFly Lens, a web map of fire activity in Brazil built from NASA FIRMS hot spots.

The record: MODIS on Aqua from ${meta.firstDay} and VIIRS on NOAA-20 from ${meta.viirsStart}, to ${meta.lastDay}, counted on a 0.25° grid and harmonized to the MODIS Aqua scale. From ${meta.observedUntil + 1} the series is VIIRS converted to that scale by a model. Hot spots are detected pixels, not individual fires. Only Brazil is covered. An area of interest is a Brazilian state, a ready-made region, or a rectangle at most 12° a side; the whole country is too large.

How to help:
- Turn requests into map actions with the tools. "Show Santa Catarina in 2006" means select_state, then set_period to a month of 2006 (the busiest month of that year when you can tell from get_fire_history, otherwise September), then say what is on screen.
- For questions about amounts, peaks, trends or comparisons, select the area, call get_fire_history and answer from what it returns. Never state a number you did not read from a tool.
- Open the analysis only when the person asks for the analysis, the calendar or the report.
- Each user message starts with the map's current state in <map_state>.
- Answer in the language the person writes in. Keep replies to two or three short sentences, in plain text without Markdown. Say "hot spots", and give months by name.
- If something is outside the record (another country, a date before ${meta.firstDay} or after ${meta.lastDay}), say so plainly.`;

/** A few requests per minute per address, to stay inside the free quota. */
const recent = new Map<string, number[]>();
function limited(address: string): boolean {
  const now = Date.now();
  const hits = (recent.get(address) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(address, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > 20;
}

let client: GoogleGenAI | null = null;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return Response.json(
      { error: "The assistant is not configured. Set GEMINI_API_KEY on the server." },
      { status: 503 },
    );
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(address))
    return Response.json({ error: "Too many questions in a minute. Wait a moment and ask again." }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "The conversation is too long. Start a new one." }, { status: 413 });
  let contents: Content[];
  try {
    contents = (JSON.parse(raw) as { contents: Content[] }).contents;
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }
  if (
    !Array.isArray(contents) ||
    !contents.length ||
    contents.length > MAX_MESSAGES ||
    contents[0].role !== "user" ||
    contents.some((c) => (c.role !== "user" && c.role !== "model") || !Array.isArray(c.parts))
  )
    return Response.json({ error: "Malformed conversation." }, { status: 400 });

  try {
    client ??= new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM,
        tools: [{ functionDeclarations: ASSISTANT_TOOLS }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: AbortSignal.timeout(45_000),
      },
    });
    const content = response.candidates?.[0]?.content;
    if (!content?.parts?.length)
      return Response.json({ error: "I couldn’t answer that one. Try asking another way." }, { status: 422 });
    // The model's turn goes back whole: its thought signatures must be replayed.
    return Response.json({ content: { role: "model", parts: content.parts } });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error("assistant: Gemini error", error.status, error.message);
      if (error.status === 429)
        return Response.json(
          { error: "The assistant’s free quota is used up for now. Try again later." },
          { status: 429 },
        );
      if (error.status === 400 || error.status === 403)
        return Response.json(
          { error: "Gemini refused the request. Check GEMINI_API_KEY, or start a new conversation." },
          { status: 400 },
        );
      return Response.json({ error: "The assistant is unavailable right now." }, { status: 502 });
    }
    console.error("assistant:", error);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      return Response.json({ error: "Gemini took too long to answer. Try again in a moment." }, { status: 504 });
    return Response.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
