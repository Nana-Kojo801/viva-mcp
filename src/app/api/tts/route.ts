import { spendTtsChars } from "@/lib/budget";
import { ensureSchema } from "@/lib/db";
import { MAX_TTS_CHARS, synthesize, TtsUnavailable } from "@/lib/tts";

export const runtime = "nodejs";

// The simulated device's speaker. Study logic goes through /api/mcp; this only turns text into audio,
// the way a real voice device does its own speech output.
export async function GET(req: Request) {
  const noStore = { "Cache-Control": "no-store" };
  const text = new URL(req.url).searchParams.get("text")?.trim() ?? "";
  if (!text || text.length > MAX_TTS_CHARS) {
    return Response.json({ error: "bad_text" }, { status: 400, headers: noStore });
  }
  // Only the Viva web app may spend the voice budget.
  if (req.headers.get("sec-fetch-site") !== "same-origin") {
    return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  if (!process.env.GOOGLE_TTS_API_KEY) {
    return Response.json({ error: "not_configured" }, { status: 501, headers: noStore });
  }
  try {
    await ensureSchema();
    if (!(await spendTtsChars(text.length))) {
      return Response.json({ error: "budget_exceeded" }, { status: 429, headers: noStore });
    }
    const speech = await synthesize(text);
    // Identical text gives identical audio, so let the CDN keep it (questions repeat across visitors).
    return Response.json(speech, {
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
    });
  } catch (err) {
    console.error("[tts]", err instanceof TtsUnavailable ? err.message : err);
    return Response.json({ error: "unavailable" }, { status: 502, headers: noStore });
  }
}
