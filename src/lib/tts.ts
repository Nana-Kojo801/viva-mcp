// Server-side text-to-speech through Google Cloud Text-to-Speech. The browser falls back to its own
// speechSynthesis voice whenever this is unavailable (no key, budget spent, or an API error).

export const MAX_TTS_CHARS = 600;
const DEFAULT_VOICE = "en-US-Chirp3-HD-Kore";

export type Speech = {
  /** Base64 MP3. */
  audio: string;
  /** Start time in seconds of each word (by index of /\S+/ matches), when the voice reports them. */
  wordTimes: number[] | null;
};

export class TtsUnavailable extends Error {}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function synthesize(text: string): Promise<Speech> {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) throw new TtsUnavailable("GOOGLE_TTS_API_KEY is not set.");
  const voice = process.env.GOOGLE_TTS_VOICE || DEFAULT_VOICE;
  // Chirp 3 HD voices don't take SSML marks; other voice families report exact word timings through them.
  const marks = !/chirp/i.test(voice);
  const words = text.match(/\S+/g) ?? [];

  const res = await fetch(`https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: marks ? { ssml: `<speak>${words.map((w, i) => `<mark name="${i}"/>${escapeXml(w)}`).join(" ")}</speak>` } : { text },
      voice: { languageCode: voice.slice(0, 5), name: voice },
      audioConfig: { audioEncoding: "MP3", speakingRate: 1 },
      ...(marks ? { enableTimePointing: ["SSML_MARK"] } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new TtsUnavailable(`Google TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { audioContent?: string; timepoints?: { markName: string; timeSeconds: number }[] };
  if (!data.audioContent) throw new TtsUnavailable("Google TTS returned no audio.");

  let wordTimes: number[] | null = null;
  if (marks && data.timepoints?.length) {
    wordTimes = words.map(() => NaN);
    for (const tp of data.timepoints) wordTimes[Number(tp.markName)] = tp.timeSeconds ?? 0;
    if (wordTimes.some((t) => Number.isNaN(t))) wordTimes = null;
  }
  return { audio: data.audioContent, wordTimes };
}
