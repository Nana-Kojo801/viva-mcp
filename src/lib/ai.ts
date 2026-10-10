// Every AI call in Viva goes through this module. To swap providers, edit this file only.
import OpenAI from "openai";
import { z } from "zod";
import { spendAiCall } from "./budget";

export const MAX_NOTES_CHARS = 24_000;
export const CHUNK_CHARS = 6_000;
export const MAX_ANSWER_CHARS = 1_000;
const MAX_CARDS_TOTAL = 40;

export class AiError extends Error {}

const DEFAULT_MODEL = "gpt-4.1-mini";

let openai: OpenAI | null = null;
function client(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new AiError("The AI service is not configured on this server.");
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 });
  return openai;
}

// ---------- schemas ----------

export const CardDraft = z.object({
  front: z.string().trim().min(5).max(300),
  back: z.string().trim().min(1).max(500),
  topic: z.string().trim().min(1).max(60),
  source_excerpt: z.string().trim().max(400),
});
export type CardDraft = z.infer<typeof CardDraft>;

const CardsOutput = z.object({ cards: z.array(CardDraft).min(1).max(20) });

export const Grade = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  feedback: z.string().trim().min(1).max(400),
  missing_points: z.array(z.string().trim().max(200)).max(5),
});
export type Grade = z.infer<typeof Grade>;

// Hand-written JSON Schemas for OpenAI strict structured output (mirror the zod schemas above).
const cardsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back", "topic", "source_excerpt"],
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          topic: { type: "string" },
          source_excerpt: { type: "string" },
        },
      },
    },
  },
} as const;

const gradeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "feedback", "missing_points"],
  properties: {
    verdict: { type: "string", enum: ["correct", "partial", "incorrect"] },
    feedback: { type: "string" },
    missing_points: { type: "array", items: { type: "string" } },
  },
} as const;

// ---------- prompts ----------

const CARDS_PROMPT = `You write flashcards for a student who will be quizzed OUT LOUD by a voice assistant.

Rules:
- Make 8 to 20 cards. Make fewer than 8 only if the notes are too short to support more.
- One idea per card.
- The front is a question that can be answered aloud in one or two sentences.
- No yes/no questions. No "which of the following". No multiple choice. No fill-in-the-blank.
- The front must make sense when heard, without seeing the notes. Avoid symbols, tables and formulas that are hard to say.
- The back is the concise answer, one or two sentences at most.
- topic is a short label of two to four words, in sentence case, shared by related cards.
- source_excerpt is a short quote (under 25 words) copied from the notes that supports the answer.
- Use only facts stated in the notes. Write in English.`;

const GRADE_PROMPT = `You grade a student's spoken answer to a flashcard question.

The answer is transcribed speech. Ignore filler words, false starts, minor transcription errors, spelling, and phrasing differences. Judge understanding, not exact wording.

Be generous. This is a spoken quiz, not a written exam, and people answer briefly out loud.

Verdicts:
- "correct": the answer shows the student understands the core idea, even if it is short, informal, or leaves out details, examples, qualifiers ("all else equal"), or the mirror-image case (for example, saying what happens when price rises but not when it falls). Mention anything worth adding in the feedback, but still mark it correct.
- "partial": the answer is relevant but misses or confuses the central idea itself, or is too vague to show understanding (for example, "producers sell more" with no link to price).
- "incorrect": the answer does not address the question, states something false, contradicts the expected answer, or is empty. Using related words is not enough for "partial".
When in doubt between "correct" and "partial", choose "correct". Do not stretch an incorrect answer into "partial".

feedback: at most two short spoken sentences, written to be read aloud. Plain sentences, no markdown, no lists, no quotes around words. Encouraging but honest. When correct but incomplete, confirm they got it and add the missing piece briefly. Address the student as "you". Do not start with the verdict word.
missing_points: the important ideas the answer left out (may be non-empty even when correct).`;

// ---------- calls ----------

async function structured<T>(opts: {
  userId: string;
  system: string;
  user: string;
  /** Optional image (data URL) sent with the user message, for vision calls. */
  image?: string;
  name: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
}): Promise<T> {
  const ai = client();
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    await spendAiCall(opts.userId);
    let raw: string | null | undefined;
    try {
      const res = await ai.chat.completions.create({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: opts.system },
          {
            role: "user",
            content: [
              { type: "text" as const, text: attempt === 0 ? opts.user : `${opts.user}\n\nYour previous output was invalid (${lastProblem}). Follow the schema exactly.` },
              ...(opts.image ? [{ type: "image_url" as const, image_url: { url: opts.image, detail: "high" as const } }] : []),
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.name, strict: true, schema: opts.jsonSchema },
        },
      });
      raw = res.choices[0]?.message?.content;
    } catch (err) {
      if (err instanceof AiError) throw err;
      console.error("[ai] request failed", err);
      throw new AiError("The AI service did not respond. Try again in a moment.");
    }
    try {
      const parsed = opts.schema.safeParse(JSON.parse(raw ?? ""));
      if (parsed.success) return parsed.data;
      lastProblem = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastProblem = "output was not valid JSON";
    }
    console.warn(`[ai] invalid ${opts.name} output on attempt ${attempt + 1}: ${lastProblem}`);
  }
  throw new AiError("The AI returned something unusable. Try again.");
}

/** Split notes into chunks of at most CHUNK_CHARS, preferring paragraph then sentence boundaries. */
export function chunkNotes(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim().slice(0, MAX_NOTES_CHARS);
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > CHUNK_CHARS) {
    const window = rest.slice(0, CHUNK_CHARS);
    let cut = window.lastIndexOf("\n\n");
    if (cut < CHUNK_CHARS * 0.5) cut = window.lastIndexOf(". ") + 1;
    if (cut < CHUNK_CHARS * 0.5) cut = CHUNK_CHARS;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export async function generateCards(text: string, userId: string): Promise<CardDraft[]> {
  const chunks = chunkNotes(text);
  const cards: CardDraft[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const out = await structured({
      userId,
      system: CARDS_PROMPT,
      user: `Notes:\n"""\n${chunk}\n"""`,
      name: "flashcards",
      jsonSchema: cardsJsonSchema,
      schema: CardsOutput,
    });
    for (const card of out.cards) {
      const key = card.front.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }
    if (cards.length >= MAX_CARDS_TOTAL) break;
  }
  return cards.slice(0, MAX_CARDS_TOTAL);
}

export async function gradeAnswer(
  card: { front: string; back: string },
  spokenAnswer: string,
  userId: string,
): Promise<Grade> {
  return structured({
    userId,
    system: GRADE_PROMPT,
    user: `Question: ${card.front}\nExpected answer: ${card.back}\nStudent's transcribed answer: ${spokenAnswer.slice(0, MAX_ANSWER_CHARS)}`,
    name: "grade",
    jsonSchema: gradeJsonSchema,
    schema: Grade,
  });
}

// ---------- phase 2: hints, re-explanations, photos of notes ----------

export const Hints = z.object({ hints: z.array(z.string().trim().min(1).max(240)).length(3) });

const hintsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["hints"],
  properties: { hints: { type: "array", items: { type: "string" } } },
} as const;

const HINTS_PROMPT = `You write a three-step hint ladder for a flashcard that a student answers out loud.

Return exactly three hints, each one sentence, written to be read aloud (no markdown, no symbols):
1. A gentle nudge: point to the right area of thinking without using the answer's key words.
2. A stronger cue: name a related idea, the kind of answer expected, or the first word or letter of a key term.
3. Almost there: give part of the answer and leave the rest for the student to finish.
Never state the full answer.`;

export async function generateHints(card: { front: string; back: string }, userId: string): Promise<string[]> {
  const out = await structured({
    userId,
    system: HINTS_PROMPT,
    user: `Question: ${card.front}\nAnswer: ${card.back}`,
    name: "hints",
    jsonSchema: hintsJsonSchema,
    schema: Hints,
  });
  return out.hints;
}

export const Explanation = z.object({
  explanation: z.string().trim().min(1).max(600),
  prerequisite: CardDraft,
});
export type Explanation = z.infer<typeof Explanation>;

const explanationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["explanation", "prerequisite"],
  properties: {
    explanation: { type: "string" },
    prerequisite: cardsJsonSchema.properties.cards.items,
  },
} as const;

const EXPLAIN_PROMPT = `A student keeps missing a flashcard. Help them from a different angle.

explanation: two or three short spoken sentences that explain the answer differently from the card, using a simple everyday example or analogy. Plain sentences for text-to-speech, no markdown, no lists. Address the student as "you".
prerequisite: one easier flashcard about the building block the student needs first, in the same format as the original (front is a question answerable aloud in one sentence, back is concise, topic matches the original card's topic, source_excerpt is a short phrase from the original answer). It must not be a copy of the original question.`;

export async function explainAgain(
  card: { front: string; back: string; topic: string },
  lastAnswer: string | null,
  userId: string,
): Promise<Explanation> {
  return structured({
    userId,
    system: EXPLAIN_PROMPT,
    user: `Question: ${card.front}\nAnswer: ${card.back}\nTopic: ${card.topic}${lastAnswer ? `\nThe student's last answer: ${lastAnswer.slice(0, MAX_ANSWER_CHARS)}` : ""}`,
    name: "explanation",
    jsonSchema: explanationJsonSchema,
    schema: Explanation,
  });
}

export const NotesPhoto = z.object({
  legible: z.boolean(),
  text: z.string().max(MAX_NOTES_CHARS),
});

const notesPhotoJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["legible", "text"],
  properties: { legible: { type: "boolean" }, text: { type: "string" } },
} as const;

const PHOTO_PROMPT = `Transcribe the study notes in this photo, handwritten or printed, into plain text.
Keep the student's wording and order. Turn bullet points into separate lines. Describe diagrams in one short sentence in square brackets. Skip doodles and page decoration. Fix obvious spelling slips but do not add facts.
Set legible to false and text to an empty string if the photo has no readable notes.`;

export async function readNotesPhoto(imageDataUrl: string, userId: string): Promise<z.infer<typeof NotesPhoto>> {
  return structured({
    userId,
    system: PHOTO_PROMPT,
    user: "Transcribe these notes.",
    image: imageDataUrl,
    name: "notes_photo",
    jsonSchema: notesPhotoJsonSchema,
    schema: NotesPhoto,
  });
}
