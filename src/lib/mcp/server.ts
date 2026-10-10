import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AiError, generateCards, gradeAnswer, MAX_NOTES_CHARS } from "../ai";
import { BudgetError } from "../budget";
import { ConfigError } from "../db";
import { verdictToQuality } from "../sm2";
import { inDays, plural, speak } from "../speech";
import * as store from "../store";

export const SERVER_INFO = { name: "viva", title: "Viva study companion", version: "0.1.0" };

const INSTRUCTIONS = `Viva quizzes the user out loud on flashcards made from their own notes and schedules reviews with spaced repetition (SM-2).
Typical voice loop: call get_next_card, read its "spoken" field aloud, listen to the user's answer, call submit_answer with the transcribed answer, read the "spoken" feedback aloud, then call get_next_card again.
Every tool returns a short "spoken" string written for text-to-speech; prefer reading it verbatim.
Never reveal the back of a card before the user answers. Use add_material when the user wants to study new notes.`;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date like 2026-12-15.")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a real calendar date.");

const id = z.string().min(1).max(64);

// "I don't know" style answers are graded locally to save an AI call.
const GAVE_UP = /^\s*(i\s*(do\s*not|don'?t)\s*know|no\s*idea|pass|i\s*give\s*up|not\s*sure)\W*$/i;

type Structured = Record<string, unknown> & { spoken: string };

function ok(data: Structured): CallToolResult {
  return { content: [{ type: "text", text: data.spoken }], structuredContent: data };
}

// Errors carry no structuredContent (it would not match the success output schema); the text is the spoken message.
function fail(code: string, spoken: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: spoken }], _meta: { "viva/error": code } };
}

async function safe(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BudgetError) return fail("budget_exceeded", err.message);
    if (err instanceof AiError) return fail("ai_unavailable", err.message);
    if (err instanceof ConfigError) {
      console.error("[mcp] config", err.message);
      return fail("not_configured", "The study database is not configured on this server.");
    }
    console.error("[mcp] tool failed", err);
    return fail("internal", "Something went wrong on the server. Try again in a moment.");
  }
}

const cardOut = z.object({ id: z.string(), front: z.string(), topic: z.string(), deck_id: z.string() });

export function createVivaServer(userId: string): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_decks",
    {
      title: "List decks",
      description: "List the user's flashcard decks with how many cards each has and how many are due now.",
      inputSchema: {},
      outputSchema: {
        spoken: z.string(),
        decks: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            exam_date: z.string().nullable(),
            card_count: z.number(),
            due_count: z.number(),
          }),
        ),
      },
      annotations: { readOnlyHint: true },
    },
    () =>
      safe(async () => {
        await store.ensureUser(userId);
        const decks = await store.listDecks(userId);
        const due = decks.reduce((n, d) => n + d.due_count, 0);
        const spoken = decks.length
          ? speak(
              `You have ${plural(decks.length, "deck")}, with ${plural(due, "card")} due now.`,
              decks.length <= 3 ? `They are ${decks.map((d) => d.title).join(", ")}.` : null,
            )
          : "You have no decks yet. Add some notes and I will make cards from them.";
        return ok({ spoken, decks });
      }),
  );

  server.registerTool(
    "add_material",
    {
      title: "Add study material",
      description:
        "Turn the user's notes into a new deck of spoken-answer flashcards (8 to 20 per section of notes). Uses AI once; cards are saved and never regenerated. Notes longer than 24,000 characters are truncated.",
      inputSchema: {
        title: z.string().trim().min(1).max(120).describe("Deck title, for example 'Cell biology chapter 3'."),
        text: z.string().trim().min(40, "Notes are too short to make cards. Add at least a few sentences.").max(200_000).describe("The notes, as plain text."),
        exam_date: isoDate.optional().describe("Optional exam date, ISO format YYYY-MM-DD."),
      },
      outputSchema: {
        spoken: z.string(),
        deck_id: z.string(),
        title: z.string(),
        card_count: z.number(),
        topics: z.array(z.string()),
        truncated: z.boolean(),
        cards: z.array(z.object({ id: z.string(), front: z.string(), back: z.string(), topic: z.string() })),
      },
    },
    ({ title, text, exam_date }) =>
      safe(async () => {
        await store.ensureUser(userId);
        const drafts = await generateCards(text, userId);
        if (!drafts.length) return fail("no_cards", "I could not find anything to quiz you on in those notes. Try adding more detail.");
        const { deckId, cards } = await store.createDeck(userId, title, exam_date ?? null, drafts);
        const topics = [...new Set(cards.map((c) => c.topic))];
        return ok({
          spoken: speak(
            `I made ${plural(cards.length, "card")} from ${title}.`,
            `They cover ${topics.slice(0, 3).join(", ")}${topics.length > 3 ? ", and more" : ""}.`,
            "Say start quiz when you are ready.",
          ),
          deck_id: deckId,
          title,
          card_count: cards.length,
          topics,
          truncated: text.length > MAX_NOTES_CHARS,
          cards: cards.map(({ id, front, back, topic }) => ({ id, front, back, topic })),
        });
      }),
  );

  server.registerTool(
    "get_next_card",
    {
      title: "Get next card",
      description:
        "Get the next card that is due for review. Returns only the question (front) and the card id; the answer stays hidden until submit_answer. If nothing is due, says so and offers to study ahead; call again with study_ahead=true to get the soonest upcoming card.",
      inputSchema: {
        deck_id: id.optional().describe("Limit to one deck. Omit to use all decks."),
        study_ahead: z.boolean().optional().describe("Return the soonest card even if it is not due yet."),
        exclude_card_ids: z.array(id).max(200).optional().describe("Cards to skip in this session, for example ones the user said skip to."),
      },
      outputSchema: {
        spoken: z.string(),
        card: cardOut.nullable(),
        due_remaining: z.number(),
        next_due_at: z.number().nullable(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ deck_id, study_ahead, exclude_card_ids }) =>
      safe(async () => {
        await store.ensureUser(userId);
        if (deck_id && !(await store.getDeck(userId, deck_id))) {
          return fail("deck_not_found", "I could not find that deck. Call list_decks to see the available decks.");
        }
        const r = await store.nextCard(userId, { deckId: deck_id, ahead: study_ahead, exclude: exclude_card_ids });
        if (!r.card) {
          const spoken = r.nextDueAt
            ? speak("You are all caught up.", `The next card is due ${inDays(r.nextDueAt)}.`, "Say study ahead to keep going anyway.")
            : "There are no cards here yet. Add some notes first.";
          return ok({ spoken, card: null, due_remaining: 0, next_due_at: r.nextDueAt });
        }
        const { id: cardId, front, topic, deck_id: deckId } = r.card;
        return ok({
          spoken: front,
          card: { id: cardId, front, topic, deck_id: deckId },
          due_remaining: r.dueRemaining,
          next_due_at: r.nextDueAt,
        });
      }),
  );

  server.registerTool(
    "submit_answer",
    {
      title: "Submit answer",
      description:
        "Grade the user's spoken answer to a card, update its spaced-repetition schedule, and return a verdict with one or two sentences of spoken feedback. Includes the correct answer when the user was wrong or partly right. Pass the transcribed speech as-is; filler words are fine.",
      inputSchema: {
        card_id: id.describe("The id from get_next_card."),
        answer: z.string().max(2000).describe("The user's answer, transcribed from speech."),
      },
      outputSchema: {
        spoken: z.string(),
        verdict: z.enum(["correct", "partial", "incorrect"]),
        feedback: z.string(),
        correct_answer: z.string().nullable(),
        missing_points: z.array(z.string()),
        quality: z.number(),
        next_review_at: z.number(),
      },
    },
    ({ card_id, answer }) =>
      safe(async () => {
        const card = await store.getCard(userId, card_id);
        if (!card) return fail("card_not_found", "I could not find that card. Call get_next_card to get a fresh one.");

        const gaveUp = !answer.trim() || GAVE_UP.test(answer);
        const grade = gaveUp
          ? { verdict: "incorrect" as const, feedback: "No problem, this one will come back soon.", missing_points: [] }
          : await gradeAnswer(card, answer, userId);

        const quality = verdictToQuality(grade.verdict, answer);
        const updated = await store.recordReview(userId, card, grade.verdict, quality, answer);
        const showAnswer = grade.verdict !== "correct";
        const spoken = showAnswer
          ? speak(grade.feedback.split(/(?<=[.!?])\s/)[0], `The answer is: ${card.back}`)
          : speak(grade.feedback);

        return ok({
          spoken,
          verdict: grade.verdict,
          feedback: grade.feedback,
          correct_answer: showAnswer ? card.back : null,
          missing_points: grade.missing_points,
          quality,
          next_review_at: updated.due_at,
        });
      }),
  );

  server.registerTool(
    "get_progress",
    {
      title: "Get progress",
      description: "Study progress: current streak, cards due today, accuracy over the last 7 days, a per-day tally for the week, and the weakest topics.",
      inputSchema: {
        deck_id: id.optional().describe("Limit to one deck. Omit for all decks."),
        timezone: z.string().max(64).optional().describe("IANA time zone for day boundaries, for example America/Chicago. Defaults to UTC."),
      },
      outputSchema: {
        spoken: z.string(),
        streak_days: z.number(),
        due_today: z.number(),
        reviewed_7d: z.number(),
        accuracy_7d: z.number().nullable(),
        week: z.array(z.object({ day: z.string(), correct: z.number(), partial: z.number(), incorrect: z.number() })),
        weak_topics: z.array(z.object({ topic: z.string(), misses: z.number(), attempts: z.number(), miss_rate: z.number() })),
      },
      annotations: { readOnlyHint: true },
    },
    ({ deck_id, timezone }) =>
      safe(async () => {
        await store.ensureUser(userId);
        const p = await store.progress(userId, { deckId: deck_id, timeZone: timezone });
        const spoken = speak(
          p.streak_days ? `You are on a ${plural(p.streak_days, "day")} streak.` : "You have not studied today yet.",
          p.accuracy_7d == null
            ? `You have ${plural(p.due_today, "card")} due today.`
            : `You have ${plural(p.due_today, "card")} due today, and you got ${Math.round(p.accuracy_7d * 100)} percent right this week.`,
          p.weak_topics[0] ? `Your weakest topic is ${p.weak_topics[0].topic}.` : null,
        );
        return ok({ spoken, ...p });
      }),
  );

  server.registerTool(
    "set_exam_date",
    {
      title: "Set exam date",
      description: "Store or change the exam date for a deck.",
      inputSchema: {
        deck_id: id.describe("The deck to update."),
        date: isoDate.describe("Exam date, ISO format YYYY-MM-DD."),
      },
      outputSchema: { spoken: z.string(), deck_id: z.string(), exam_date: z.string() },
      annotations: { idempotentHint: true },
    },
    ({ deck_id, date }) =>
      safe(async () => {
        if (!(await store.setExamDate(userId, deck_id, date))) {
          return fail("deck_not_found", "I could not find that deck. Call list_decks to see the available decks.");
        }
        const when = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
        return ok({ spoken: `Got it. Your exam is on ${when}.`, deck_id, exam_date: date });
      }),
  );

  server.registerTool(
    "delete_card",
    {
      title: "Delete card",
      description: "Permanently delete one card, for example a badly generated one.",
      inputSchema: { card_id: id.describe("The card to delete.") },
      outputSchema: { spoken: z.string(), card_id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ card_id }) =>
      safe(async () => {
        if (!(await store.deleteCard(userId, card_id))) return fail("card_not_found", "That card was already gone.");
        return ok({ spoken: "Deleted that card.", card_id });
      }),
  );

  return server;
}
