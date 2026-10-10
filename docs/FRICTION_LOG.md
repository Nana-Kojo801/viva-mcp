# Friction log

Entries are added as problems come up during the build, not at the end.

Format: task, steps taken, expected vs. actual, severity, workaround, suggestion.

| # | Area | Issue | Severity |
|---|---|---|---|
| 1 | MCP TypeScript SDK | The client validates error results against the output schema; the server doesn't | Medium |
| 2 | MCP TypeScript SDK | The client's GET probe logs 405s against stateless servers | Low |
| 3 | MCP TypeScript SDK docs | The Web-standard transport for Next.js is hard to find | Low |
| 4 | OpenAI docs | Pricing pages disagree; no structured-output matrix | Low |
| 5 | Web Speech API (Android) | Recognition hears silence while another mic stream is open | High |
| 6 | Web Speech API | Robotic voices; word boundaries missing or early | Medium |
| 7 | Next.js / Vercel | Reading `searchParams` makes a page dynamic and loses prefetching | Medium |
| 8 | Vercel + MCP SDK | Two request-size limits for uploads | Low |
| 9 | Turso / libSQL | No migration helper for serverless schema changes | Low |
| 10 | React ViewTransition | A persistent tab bar fades during page transitions | Low |

---

## 1. Tool error results fail client-side output-schema validation

- **Area:** MCP TypeScript SDK 1.32.1 (`Client.callTool`, `McpServer.registerTool`)
- **Task:** Return a friendly error from a tool that declares an `outputSchema`, with a `spoken` message in `structuredContent` so voice clients can read it out.
- **Steps:** I returned `{ isError: true, content: [...], structuredContent: { spoken, error } }` from a tool whose output schema has other required fields.
- **Expected:** Error results are exempt from output-schema validation. The server already exempts them: `McpServer.validateToolOutput` returns early when `isError` is set.
- **Actual:** The client still validated the structured content and threw `MCP error -32602: Structured content does not match the tool's output schema`, so the friendly message never reached the caller.
- **Severity:** Medium. A tool that reports errors well breaks every client.
- **Workaround:** Error results carry no `structuredContent`. The spoken message is the text content, and a machine-readable code goes in `_meta["viva/error"]`.
- **Suggestion:** Make client and server agree: skip output-schema validation on the client when `isError` is true. The spec could also say explicitly whether `structuredContent` on an error result must match `outputSchema`.

## 2. Stateless Streamable HTTP: client probes GET and logs 405s

- **Area:** MCP TypeScript SDK client, Streamable HTTP transport
- **Task:** Run a stateless MCP server on serverless functions and call it from the browser with the official client.
- **Steps:** After `initialize`, the client sends a `GET` to open a standalone SSE stream. The stateless server answers 405, as the spec allows.
- **Expected:** A quiet fallback.
- **Actual:** It works, but the browser console shows a red "Failed to load resource: 405" on every page load. This looks like a bug to anyone reading the console, including judges.
- **Severity:** Low (cosmetic, but confusing).
- **Workaround:** None needed. I documented the 405 in the README.
- **Suggestion:** Let the client skip the GET probe, for example with a transport option like `openStandaloneStream: false`. Alternatively, let the server advertise in the initialize result that it has no standalone stream.

## 3. Choosing the transport class for Next.js route handlers

- **Area:** MCP TypeScript SDK docs
- **Task:** Serve MCP from a Next.js App Router route handler, which uses Web `Request` and `Response` rather than Node `req`/`res`.
- **Steps:** The README examples use Express with `StreamableHTTPServerTransport`. I found `WebStandardStreamableHTTPServerTransport` by reading the package's `dist` folder.
- **Expected:** A documented example for Web-standard runtimes such as Next.js, Hono, and Workers.
- **Actual:** The class exists and works well (`transport.handleRequest(req)` returns a `Response`), but it's hard to discover.
- **Severity:** Low.
- **Suggestion:** Add a short "Next.js / Web standard" section to the SDK README that shows stateless mode and `enableJsonResponse: true`.

## 4. OpenAI pricing pages disagree on the cheapest model

- **Area:** OpenAI docs and third-party pricing pages
- **Task:** Pick the current cheapest good model that supports structured JSON output.
- **Steps:** I searched for current pricing. Third-party pages disagreed on prices and on which model is cheapest, and none of them listed structured-output support per model.
- **Severity:** Low.
- **Workaround:** I chose a fast non-reasoning model (`gpt-4.1-mini`), because voice grading is latency-sensitive. The model can be overridden with `OPENAI_MODEL`, and all calls sit behind one module.
- **Suggestion:** Add a per-model capability matrix (structured outputs, latency class) next to pricing.

## 5. Phone microphone: speech recognition hears silence while another stream is open

- **Area:** Web Speech API, Chrome on Android
- **Task:** Animate the mic button with the live input level (a Web Audio analyser on a `getUserMedia` stream) while `SpeechRecognition` transcribes the answer.
- **Steps:** I opened the level-meter stream, then started recognition. Both worked together on desktop Chrome.
- **Expected:** Both run together, as on desktop, or recognition reports an `audio-capture` error.
- **Actual:** On the builder's Android phone, recognition started but received only silence. Nothing was transcribed, and tapping stop ended with "no speech". No error event fired, so the code couldn't detect it. It only showed up when testing on a real phone.
- **Severity:** High. The core feature was broken on the main target device.
- **Workaround:** On phones, the level meter doesn't run. The mic animation is driven by recognition's own `soundstart`, `speechstart` and `result` events instead. Audio output is also suspended while listening.
- **Suggestion:** Browsers could raise an `audio-capture` error, or document that the mic can't be shared on mobile. MDN's `SpeechRecognition` page could mention it.

## 6. Robotic browser voices, and word-boundary events that don't line up

- **Area:** Web Speech API (`speechSynthesis`)
- **Task:** Read each question aloud and move a highlighter word by word in sync.
- **Steps:** I used `SpeechSynthesisUtterance` `boundary` events, with a timed sweep as the fallback.
- **Expected:** Natural speech with word events.
- **Actual:** On Android, the default voice sounded robotic to the builder. Boundary events were missing, and `onstart` fired before audio was heard, so the sweep ran ahead of the voice.
- **Severity:** Medium. It hurts the core experience.
- **Workaround:** Speech now comes from Google Cloud Text-to-Speech (a Chirp 3 HD voice) through a small `/api/tts` route, played through Web Audio. The highlighter follows the audio clock: exact SSML mark timings for voices that support them, and estimates from the clip length for Chirp voices. The browser voice remains the fallback.
- **Suggestion:** Google Cloud TTS: support SSML `<mark>` timepoints on Chirp 3 HD voices. Their quality is the reason to choose them, but the lack of timings rules out exact sync.

## 7. A page that reads `searchParams` quietly loses prefetching

- **Area:** Next.js 16 App Router on Vercel
- **Task:** Open the quiz for a specific deck with `/?deck=<id>`.
- **Steps:** The page component awaited `searchParams` and passed the deck id to the client component.
- **Expected:** All three tabs feel equally fast.
- **Actual:** That one read made `/` a dynamic route (ƒ in the build output). It was rendered on the server on every navigation and not prefetched, while Notes and Progress were static and instant. The builder noticed the Quiz tab lagging on a phone. The build output marks it, but nothing warns about the cost.
- **Severity:** Medium (noticeable on mobile networks and after cold starts).
- **Workaround:** The page is static again, and the client component reads `?deck=` from `window.location` after mounting. A small client cache also lets every screen draw its last data instantly.
- **Suggestion:** In development, show a hint when a page becomes dynamic only because of `searchParams`, with the client-side alternative.

## 8. Request-size limits stack up for photo uploads

- **Area:** Vercel Functions and the MCP TypeScript SDK
- **Task:** Send a photo of handwritten notes to an MCP tool (`read_notes_photo`) as a data URL.
- **Expected:** One clearly documented limit.
- **Actual:** Vercel caps function request bodies at 4.5 MB, and the SDK's `WebStandardStreamableHTTPServerTransport` has its own `maxRequestBodySize` (4 MiB by default). A phone photo is often 3–6 MB, and base64 adds a third on top.
- **Severity:** Low (once found).
- **Workaround:** The browser downscales photos to 1800px JPEG (usually 300–600 KB), and the transport limit is set to 4.5 MB to match Vercel. For documents, the browser extracts the text and uploads only that, so a 30 MB slide deck becomes a few KB.
- **Suggestion:** The MCP SDK docs could mention `maxRequestBodySize` alongside common hosting limits. MCP could also standardize how a tool accepts a binary upload.

## 9. No migration path in the libSQL client

- **Area:** Turso / `@libsql/client`
- **Task:** Add three columns to the live `cards` table for Phase 2 (stored hints, explanations, prerequisite links).
- **Expected:** A small built-in way to run migrations, or a documented recipe.
- **Actual:** `CREATE TABLE IF NOT EXISTS` doesn't add new columns, and SQLite has no `ADD COLUMN IF NOT EXISTS`. Two serverless instances can also race on the same `ALTER TABLE`.
- **Severity:** Low.
- **Workaround:** On first use, each server instance checks `PRAGMA table_info(cards)` and adds any missing column. It ignores the "duplicate column" error if another instance got there first.
- **Suggestion:** A tiny `migrate()` helper in the client, or a docs recipe for "schema changes from serverless functions".

## 10. A fixed tab bar fades out during view transitions

- **Area:** React `<ViewTransition>` in Next.js 16
- **Task:** Slide pages left and right between tabs while the bottom tab bar stays put.
- **Expected:** The tab bar lives in the layout, outside the page's `<ViewTransition>`, so it shouldn't animate.
- **Actual:** Even with its own `view-transition-name`, the default animation crossfades the old and new snapshots of a named element. The tab bar also changes colour between the blue quiz and the grey pages, so it visibly faded out and back in on every tab change. The builder saw it "disappear for a second".
- **Severity:** Low (but visible on every navigation).
- **Workaround:** Hide the tab bar's old snapshot and turn off its group animation (`::view-transition-old(main-nav) { display: none }`), so the new tab bar shows immediately.
- **Suggestion:** The view-transitions guide could include a "persistent chrome" recipe (navigation bars and headers that shouldn't animate).
