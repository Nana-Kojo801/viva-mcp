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
                  │   get_progress, set_exam_date, delete_card   │
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
| `get_next_card` | optional `deck_id`, `study_ahead`, `exclude_card_ids` | The next due card's **front only**, plus its id. If nothing is due, it says so and offers to study ahead. |
| `submit_answer` | `card_id`, `answer` | AI grades the transcribed answer and updates the SM-2 schedule. Returns the verdict and spoken feedback, plus the correct answer if the user was wrong. "I don't know" is graded without an AI call. |
| `get_progress` | optional `deck_id`, `timezone` | Streak, cards due today, 7-day accuracy, a per-day tally for the week, and the weakest topics. |
| `set_exam_date` | `deck_id`, `date` (ISO) | Stores the exam date. |
| `delete_card` | `card_id` | Deletes a bad card. The notes screen uses this. |

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

## How the simulation works

The quiz screen plays the part of an Alexa+ device:

1. **Start quiz** (one tap) calls `get_next_card` through the MCP client and reads the question aloud with `speechSynthesis`. A highlighter bar follows the spoken word, driven by `SpeechSynthesisUtterance` boundary events, or by a timed sweep when the voice doesn't report boundaries.
2. Tap the mic to answer. `SpeechRecognition` (or `webkitSpeechRecognition`) shows the live transcript, and the mic circle swells with the input level from a Web Audio analyser. Recognition stops on silence or when you tap again.
3. The transcript is first checked for voice commands: **skip**, **repeat**, **I don't know**, **stop**, and **study ahead**. Anything else is sent to `submit_answer`.
4. The examiner's mark (tick, partial circle, or cross) is drawn once. The `spoken` feedback is read aloud, and the next question follows automatically.

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

### Create the Turso database

From the Turso dashboard (works on a phone): create a database, open it, copy the **URL** (`libsql://…`), and create a **token**. Or use the CLI:

```bash
turso db create viva
turso db show viva --url
turso db tokens create viva
```

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
