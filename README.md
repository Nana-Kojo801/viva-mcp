# Viva

A voice-first study companion. Add your notes, and Viva turns them into flashcards. It then quizzes you out loud, grades your spoken answers, and schedules reviews with spaced repetition.

Viva was built for the **Alexa+ track** of the Build, Ship, Shape: Amazon Developer Hackathon 2026. It has two cooperating parts in one repo:

1. **A real MCP server** at `/api/mcp`. It exposes study tools over MCP Streamable HTTP (protocol `2025-11-25`, stateless), so an Alexa+ device or any MCP client can connect to it.
2. **A web app** with three screens: *Add notes*, *Quiz* (a simulated Alexa+ experience with mic and speaker in the browser), and *Progress*. The quiz uses the official MCP client to call **the same MCP server** over HTTP that an external agent would use. It has no private shortcut APIs.

Both parts share one Turso database.

## Architecture

```
                 ┌──────────────────────── browser ────────────────────────┐
                 │  Add notes        Quiz (simulated Alexa+)     Progress  │
                 │      │        mic: Web Speech recognition         │     │
                 │      │        speaker: speechSynthesis            │     │
                 │      └──────────────┬─────────────────────────────┘     │
                 │      MCP client (@modelcontextprotocol/sdk)             │
                 └─────────────────────┼───────────────────────────────────┘
                                       │  JSON-RPC over Streamable HTTP
  Alexa+ / any MCP client ────────────►│  POST /api/mcp   (x-viva-user header)
                                       ▼
                  ┌───────────── Next.js on Vercel ─────────────┐
                  │  McpServer + WebStandardStreamableHTTP       │
                  │  transport (stateless, one per request)      │
                  │   tools: list_decks, add_material,           │
                  │   get_next_card, submit_answer,              │
                  │   get_progress, set_exam_date, delete_card,  │
                  │   get_hint, explain_again, get_study_nudge,  │
                  │   read_notes_photo                           │
                  │      │                │                      │
                  │  src/lib/ai.ts    src/lib/sm2.ts             │
                  │  (OpenAI, zod,    (SM-2, plain code)         │
                  │   budget guards)                             │
                  └──────┬───────────────┬──────────────────────┘
                         ▼               ▼
                     OpenAI API     Turso (libSQL)
```

## MCP tools

Every tool returns structured data plus a `spoken` string written for text-to-speech: plain sentences, no markdown, at most three sentences.

| Tool | Inputs | What it does |
|---|---|---|
| `list_decks` | none | The user's decks with card and due counts. |
| `add_material` | `title`, `text`, optional `exam_date` | Generates cards from notes with AI and saves a deck. Returns the card count, topics, and cards. |
| `get_next_card` | optional `deck_id`, `study_ahead`, `exclude_card_ids` | The next card's **front only**, plus its id and a `reason`. Unanswered prerequisite cards come first. When a deck's exam is within 21 days, due cards from the weakest topics are pulled forward, more strongly as the exam gets closer. If nothing is due, it says so and offers to study ahead. |
| `submit_answer` | `card_id`, `answer`, optional `hints_used` | AI grades the transcribed answer and updates the SM-2 schedule. Returns the verdict and spoken feedback, plus the correct answer if the user was wrong. A correct answer that needed hints scores lower. After a card is missed twice, the result sets `suggest_explain`. "I don't know" is graded without an AI call. |
| `get_progress` | optional `deck_id`, `timezone` | Streak, cards due today, 7-day accuracy, a per-day tally for the week, and the weakest topics. |
| `set_exam_date` | `deck_id`, `date` (ISO) | Stores the exam date. |
| `delete_card` | `card_id` | Deletes a bad card. The notes screen uses this. |
| `get_hint` | `card_id`, optional `level` (1–3) | A hint ladder: a nudge, then a strong cue, then part of the answer. All three hints come from one AI call and are stored on the card, so they are never regenerated. |
| `explain_again` | `card_id` | Re-explains a missed card from a different angle, with an everyday example, and adds an easier prerequisite card to the deck that comes up next. Generated once per card. |
| `get_study_nudge` | optional `deck_id`, `timezone` | A short proactive suggestion based on the nearest exam date, cards due, the streak, and the weakest topic. It is spoken when a quiz session starts. No AI is used. |
| `read_notes_photo` | `image` (JPEG, PNG or WebP data URL) | Transcribes a photo of handwritten or printed notes into text, ready for `add_material`. The web app downscales photos before sending them. |

Tool errors (budget reached, unknown card, AI unavailable) come back as `isError: true` results with a friendly spoken message, plus a machine-readable code in `_meta["viva/error"]`. Raw exceptions are never returned.

**Users.** There is no sign-up. Each browser gets an anonymous id in the `viva_user` cookie, and the web app sends it as the `x-viva-user` header. MCP clients that omit the header act as the shared `demo` user. Every new user automatically gets their own copy of a 12-card demo deck ("Supply and demand basics"), so the quiz works with one tap.

## Connecting an MCP client

```bash
# initialize (protocol 2025-11-25 is negotiated)
curl -s -X POST https://YOUR-APP.vercel.app/api/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# list tools
curl -s -X POST https://YOUR-APP.vercel.app/api/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

If `MCP_API_KEY` is set, add `-H 'authorization: Bearer <key>'`. Add `-H 'x-viva-user: <id>'` to act as a specific user.

The repo includes a smoke test that runs the full voice loop with the official MCP client:

```bash
npm run mcp:smoke -- https://YOUR-APP.vercel.app/api/mcp
```

You can also use the MCP Inspector (`npx @modelcontextprotocol/inspector`). Choose the "Streamable HTTP" transport and the URL above.

The server is **stateless**: each POST gets a fresh server and transport and no session id is issued, which fits serverless functions. `GET` and `DELETE` return 405, as the spec allows for servers that offer no standalone SSE stream.

## Adding notes

The notes screen accepts pasted text, a photo, or a file. Files are turned into text **in the browser**, and only the text is sent to `add_material`, so large slide decks never hit request limits:

| File | How it's read |
|---|---|
| PDF | `unpdf` (a serverless build of PDF.js), loaded only when a PDF is chosen. Scanned PDFs have no text layer, so photograph those pages instead. |
| Word `.docx`, PowerPoint `.pptx`, Excel `.xlsx`, OpenDocument `.odt/.odp/.ods` | Unzipped with `fflate`; paragraphs are read from the XML. Slides come in order, each followed by its speaker notes. |
| RTF, HTML, Markdown, plain text, CSV, subtitles, and any other text file | Read directly, with markup stripped. |
| Images (JPEG, PNG, WebP) | Sent to `read_notes_photo` after the browser downscales them. |
| Old binary `.doc/.ppt/.xls`, Apple iWork | Not supported. Viva says how to convert them (save as `.docx`, `.pptx` or PDF). |

## How the simulation works

The quiz screen plays the part of an Alexa+ device:

1. **Start quiz** (one tap) calls `get_next_card` through the MCP client and reads the question aloud. A highlighter bar follows the spoken word.
   - **Voice:** with `GOOGLE_TTS_API_KEY` set, speech comes from Google Cloud Text-to-Speech (a Chirp 3 HD voice) through `/api/tts`, and is played with Web Audio. The highlighter is timed against the audio clock: it uses exact word timings for voices that report them and estimates them from the audio length for the others. Identical sentences are cached by the CDN.
   - **Fallback:** without the key, or when the daily voice budget is spent, the browser's `speechSynthesis` speaks instead, driven by boundary events or a conservative timed sweep. `/api/tts` is only the simulated device's speaker; all study logic goes through MCP.
2. Tap the mic to answer. `SpeechRecognition` (or `webkitSpeechRecognition`) shows the live transcript. Recognition stops on silence or when you tap again. On desktop, the mic circle swells with the input level from a Web Audio analyser. On phones, it breathes with recognition events instead, because phones can't share the microphone between `getUserMedia` and speech recognition.
3. The transcript is first checked for voice commands: **hint**, **repeat**, **skip**, **I don't know**, **explain**, **next**, **stop**, and **study ahead**. Anything else is sent to `submit_answer`.
4. The examiner's mark (tick, partial circle, or cross) is drawn once, and the `spoken` feedback is read aloud.
   - After a correct answer, the next question follows automatically.
   - After a miss, a countdown gives you time to say "explain" first.
   - When a card keeps being missed, the explain button is highlighted and the session waits for you.
5. The first tap of a session speaks the `get_study_nudge` suggestion, for example "Your exam is in 5 days. Elasticity needs the most work, so I'll start there." Ending a session shows a summary with a tally of correct answers.

Fallbacks: if speech recognition isn't available (for example, some iPhone browsers), or the microphone is blocked, a text box appears, and questions are still read aloud. "No speech", network failures, and the daily demo limit each show a plain message that says what to do next.

## Spaced repetition

`src/lib/sm2.ts` implements SM-2 on quality 0–5 (correct = 5, or 4 if the transcript sounds hesitant; partial = 3; incorrect = 1):

- quality < 3: repetitions reset to 0, the interval becomes 1 day, and lapses increase by 1
- otherwise: the interval goes 1 day, then 6 days, then `previous_interval × ease`
- `ease = max(1.3, ease + 0.1 − (5 − q)(0.08 + (5 − q) × 0.02))`

One addition: a missed card keeps the 1-day SM-2 interval, but its `due_at` is set 10 minutes ahead (a relearning step), so it comes back later in the same session. Unit tests are in `tests/`.

## AI and budget guards

All AI calls go through `src/lib/ai.ts` (OpenAI, default model `gpt-4.1-mini`, which you can override with `OPENAI_MODEL`). Outputs use strict JSON schema, are validated with zod, and are retried once if invalid.

- Notes are truncated to 24,000 characters and split into chunks of about 6,000 characters, one call per chunk. Each call produces 8 to 20 cards.
- Before **every** AI call, the `usage` table is checked and incremented for a global daily cap (`AI_DAILY_CALL_CAP`) and a per-user daily cap (`AI_SESSION_DAILY_CAP`). When either cap is reached, tools return "Demo limit reached for today…" in both the UI and `spoken`.
- Cards are generated once and never regenerated. Spoken answers are truncated to 1,000 characters.

## Setup

Requirements: Node.js 20.12 or later, a [Turso](https://turso.tech) database, and an OpenAI API key.

```bash
git clone https://github.com/Nana-Kojo801/viva-mcp.git
cd viva-mcp
npm install
cp .env.example .env.local   # then fill it in
npm run db:setup             # optional: the server also creates the schema on first request
npm run dev                  # http://localhost:3000
```

For local development without Turso, set `TURSO_DATABASE_URL=file:viva.db` to use a local SQLite file. Don't do this in production, because serverless file systems are wiped between requests.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | yes | Used for card generation and grading. Server only; it is never sent to the browser. |
| `OPENAI_MODEL` | no | Overrides the model. The default is `gpt-4.1-mini`. |
| `TURSO_DATABASE_URL` | yes | `libsql://<db>-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | yes for Turso | Database auth token. |
| `MCP_API_KEY` | no | When set, external MCP clients must send `Authorization: Bearer <key>`. The Viva web app's same-origin browser requests are allowed without it. |
| `AI_DAILY_CALL_CAP` | no | Global AI calls per day (UTC). The default is 300. |
| `AI_SESSION_DAILY_CAP` | no | AI calls per user per day. The default is 40. |
| `GOOGLE_TTS_API_KEY` | no | Google Cloud API key with the Text-to-Speech API enabled. It gives the natural voice; without it, the browser voice is used. |
| `GOOGLE_TTS_VOICE` | no | The voice name. The default is `en-US-Chirp3-HD-Kore`. Non-Chirp voices (for example `en-US-Neural2-F`) report exact word timings. |
| `TTS_DAILY_CHAR_CAP` | no | Characters of speech per day across all visitors. The default is 30,000, about 900k a month, which stays inside the free tier. |

### Create the Turso database

From the Turso dashboard (works on a phone): create a database, open it, copy the **URL** (`libsql://…`), and create a **token**. Or use the CLI:

```bash
turso db create viva
turso db show viva --url
turso db tokens create viva
```

### Get a Google Cloud Text-to-Speech key (optional, for the natural voice)

1. In the [Google Cloud console](https://console.cloud.google.com), create a project and enable **Cloud Text-to-Speech API**. A billing account is required, but the monthly free tier covers this demo.
2. Go to **APIs & Services → Credentials → Create credentials → API key**. Under **API restrictions**, restrict the key to Cloud Text-to-Speech API.
3. Add the key as `GOOGLE_TTS_API_KEY` in Vercel and redeploy.

### Deploy to Vercel

1. In Vercel, choose **Add New → Project** and import this GitHub repo. The framework preset is detected as Next.js, so the defaults need no changes.
2. Under **Environment Variables**, add `OPENAI_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and optionally `AI_DAILY_CALL_CAP`, `AI_SESSION_DAILY_CAP`, and `MCP_API_KEY`.
3. Deploy. The tables are created on the first request to `/api/mcp`.
4. Check it with `npm run mcp:smoke -- https://YOUR-APP.vercel.app/api/mcp`, or with the `curl` commands above.

`/api/mcp` sets `maxDuration = 60`, so `add_material` has time for long notes on the Hobby plan.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the dev server. |
| `npm run build` / `npm start` | Production build and server. |
| `npm test` | Unit tests (SM-2, budget, AI parsing, store, voice commands). |
| `npm run lint` | Type check. |
| `npm run db:setup` | Applies the schema to `TURSO_DATABASE_URL`. |
| `npm run mcp:smoke -- <url>` | Runs the full tool loop with the official MCP client. |

## Project layout

```
src/app/api/mcp/route.ts   MCP endpoint (Streamable HTTP, stateless)
src/lib/mcp/server.ts      Tool definitions
src/lib/ai.ts              All AI calls: generateCards, gradeAnswer
src/lib/budget.ts          Daily AI caps
src/lib/sm2.ts             Spaced repetition
src/lib/store.ts           Database queries
src/lib/seed.ts            Demo deck
src/lib/client/            Browser MCP client, voice helpers, anonymous user id
src/components/            Quiz, Notes, Progress UI
docs/                      Design plan, friction log, product feedback
```

## License

MIT. See [LICENSE](LICENSE).
