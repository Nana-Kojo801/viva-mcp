# Friction log

Entries are added as problems come up during the build, not at the end.

Format: task, steps taken, expected vs. actual, severity, workaround, suggestion.

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
