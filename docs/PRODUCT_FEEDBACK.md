# Product feedback

Feedback from building Viva for the Alexa+ track. Viva is a real MCP server and a browser-based simulated Alexa+ experience that calls it. The detailed problems, with reproduction steps, are in [FRICTION_LOG.md](FRICTION_LOG.md).

## Tools and SDKs used, and for what

| Tool | Used for |
|---|---|
| **MCP TypeScript SDK** (`@modelcontextprotocol/sdk` 1.32.1) | The server: 11 tools over Streamable HTTP, protocol `2025-11-25`, stateless, inside a Next.js route handler. The client: the browser simulation calls the server with the official `Client` and `StreamableHTTPClientTransport`, as an Alexa+ device would. |
| **Next.js 16** (App Router, React 19.3) on **Vercel** | The web app, the MCP endpoint as a serverless function, CDN caching for speech audio, and `<ViewTransition>` page animations. |
| **Turso** (`@libsql/client`) | Hosted SQLite: users, decks, cards, reviews, and the daily AI usage counters. |
| **OpenAI API** (`gpt-4.1-mini`, strict JSON schema) | Card generation, answer grading, hint ladders, re-explanations, and reading photos of handwritten notes. |
| **Google Cloud Text-to-Speech** (Chirp 3 HD) | The natural voice of the simulated device. |
| **Web Speech API** | Speech recognition for answers, and the fallback voice. |
| **zod**, **fflate**, **unpdf** | Schemas for tools and AI output; reading Office files and PDFs in the browser. |

## What worked well

**MCP TypeScript SDK**
- `registerTool` with zod input and output schemas is the best part. One schema validates inputs, documents the tool for agents, and is published as JSON Schema. Output schemas made the `spoken` field a contract instead of a convention.
- `WebStandardStreamableHTTPServerTransport` fits Next.js route handlers exactly: `handleRequest(Request)` returns a `Response`. Stateless mode (`sessionIdGenerator: undefined`) with `enableJsonResponse: true` is the right shape for serverless functions, with no session store to run.
- Version 1.32.1 negotiated `2025-11-25` without any configuration.
- The same SDK's client runs in the browser unchanged. Making the simulation honest, so that every study action is a real MCP call, cost nothing extra.
- Server `instructions` in the `initialize` result are a good place to describe a multi-tool voice loop to an agent.

**Next.js and Vercel**
- Import from GitHub, add environment variables, deploy: the first deploy was live in minutes, from a phone.
- Route handlers took both the MCP endpoint and a cached speech route with no extra infrastructure. `maxDuration` gave card generation room on the Hobby plan.
- Next.js 16 ships its own docs inside `node_modules/next/dist/docs`, and its `AGENTS.md` points coding agents there. That prevented guessing from outdated APIs (for example, `<ViewTransition>` with `transitionTypes` on `Link`).

**Turso**
- The same client works with `file:` locally, `:memory:` in tests, and `libsql://` in production. The unit tests run against a real SQLite engine with no mocks.
- `batch()` makes the "update schedule + insert review" write atomic and cheap. An `INSERT … ON CONFLICT … WHERE calls < cap RETURNING` statement gives an atomic budget counter in one round trip.

**OpenAI**
- Strict JSON schema output, plus zod validation, plus one retry was reliable: no unusable outputs during testing. Grading by meaning ("filler words are fine") worked well on messy transcripts once the prompt asked for generosity. Vision read cursive notes word for word.

## What needs work

**MCP TypeScript SDK and spec**
1. **Error results and output schemas disagree.** The server skips output validation for `isError` results, but the client still validates them and throws, so a tool's friendly error message never arrives (friction #1). Voice clients need those messages most.
2. **There's no standard place for text meant to be spoken.** Every Viva tool returns a `spoken` field, but that's my convention. A voice-first ecosystem would benefit from a standard annotation, such as an `audience: "speech"` hint on a text content block, with guidance like "plain sentences, no markdown, at most N sentences", so any agent could read results aloud well.
3. **Stateless servers and the client's GET probe.** The client always tries to open a standalone SSE stream, and every page load logs a red 405 in the console (#2). An option to skip it, or a capability flag in `initialize`, would fix that.
4. **Docs for Web-standard runtimes.** Next.js, Hono, Workers, Deno and Bun all use `Request` and `Response`, yet the examples center on Express (#3).
5. **Uploading binary data to tools.** A photo has to travel as a base64 data URL inside JSON, against stacked body limits (#8). A standard way for a tool to accept a file would help any "add your material" use case.

**Web Speech API** (the platform behind any browser simulation of a voice device)
- On Android, recognition quietly hears silence if another microphone stream is open (#5). Voices are robotic, and word boundaries are missing or arrive early (#6). For a voice-first hackathon track, a reference simulation kit would save every team the same work: mic, transcript, text-to-speech with word timings, and fallbacks.

**Next.js / Vercel**
- Reading `searchParams` in a page made it dynamic and quietly lost prefetching, so one tab felt slow on phones (#7). A hint in development would have caught it.
- Request size limits differ between the platform and libraries (#8).

**Turso**
- There's no migration helper for adding columns from serverless functions (#9).

## Onboarding: zero to hello world

| Step | Time | Notes |
|---|---|---|
| MCP server answering `initialize` with `2025-11-25` | About 30 minutes | Installing, choosing the right transport class (found by reading the package's types), and registering one tool. Most of the time went to finding the Web-standard transport. |
| A real MCP client calling it from a script | About 10 minutes | `Client` + `StreamableHTTPClientTransport` worked the first time. |
| The same client in the browser | About 10 minutes | No bundler configuration was needed. |
| Turso database created and connected | About 5 minutes | Done from the phone dashboard: copy the URL and a token. The schema is applied by the app on first request. |
| Vercel deploy | About 5 minutes | Import the repo, add environment variables, deploy. |
| Google Cloud TTS key | About 15 minutes | Creating a project, billing, enabling the API, and restricting the key is the longest setup of any service here. |

## Would I build with them again?

- **MCP TypeScript SDK: yes.** Typed tools with schemas and a transport that fits serverless made the real server and the honest simulation one codebase. I'd want friction #1 fixed and a standard for spoken output before shipping a voice product at scale.
- **Vercel + Next.js: yes.** It went from a phone to a live, prefetched, animated app quickly. Watch for pages that accidentally become dynamic.
- **Turso: yes**, for small, serverless, SQL-shaped data. A migration helper would remove the one rough edge.
- **OpenAI: yes**, for structured output. The single `ai.ts` module keeps the provider swappable.
- **Web Speech API: only as a fallback.** It's free and everywhere, but too inconsistent across devices to be the main voice.
