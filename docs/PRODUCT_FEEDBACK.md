# Product feedback

Draft, updated during the build.

## Tools and SDKs used

- MCP TypeScript SDK (`@modelcontextprotocol/sdk`): MCP server over Streamable HTTP, and the MCP client used by the in-browser simulation.
- Next.js on Vercel: web app and serverless hosting.
- Turso (`@libsql/client`): hosted SQLite database.
- OpenAI API: card generation and answer grading.
- Web Speech API: speech recognition and speech synthesis in the browser.

## What worked well

- **MCP TypeScript SDK:** `McpServer.registerTool` with zod input and output schemas is pleasant. The same zod schemas validate inputs, document the tools, and produce JSON Schema for clients. `WebStandardStreamableHTTPServerTransport` dropped straight into a Next.js route handler, and stateless mode (`sessionIdGenerator: undefined`) with `enableJsonResponse: true` fits serverless functions well. Version 1.32.1 negotiates protocol `2025-11-25` without any configuration.
- **Using the official MCP client in the browser** made the simulation honest at no extra cost: the quiz screen speaks the same protocol as an external agent.
- **Turso / libSQL:** the same client works with `file:` URLs locally, `:memory:` in tests, and `libsql://` in production, so tests need no mocks. `batch()` gives cheap multi-statement transactions.
- **Web Speech API:** zero-cost speech in and out. Speech synthesis boundary events make the word-by-word reading line possible.

## What needs work

- **MCP SDK:** the client validates `structuredContent` on error results against the output schema while the server does not, so friendly tool errors break the client (friction log #1). There is also no way to stop the client's GET probe against a stateless server (#2), and the Web-standard transport is under-documented (#3).
- **Web Speech API:** behavior varies a lot between browsers. Boundary events are missing for some voices, `onend` sometimes never fires on mobile, and recognition is unavailable on some iPhone browsers. Each needed a fallback.

## Onboarding, zero to hello world

## Would I build with them again
