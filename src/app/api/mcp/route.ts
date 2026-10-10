import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ensureSchema } from "@/lib/db";
import { createVivaServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// add_material can make several AI calls for long notes.
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID, X-Viva-User",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

function userFrom(req: Request): string {
  const raw = req.headers.get("x-viva-user")?.trim();
  return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : "demo";
}

/**
 * When MCP_API_KEY is set, external clients must send it as a bearer token.
 * The Viva web app's own simulation runs in the browser on the same origin, so
 * same-origin browser requests (Sec-Fetch-Site, which pages cannot forge) are let through.
 */
function authorized(req: Request): boolean {
  const key = process.env.MCP_API_KEY;
  if (!key) return true;
  if (req.headers.get("authorization") === `Bearer ${key}`) return true;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

function jsonError(status: number, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers: CORS });
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid bearer token." }, id: null }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="viva"' },
    });
  }

  try {
    await ensureSchema();
  } catch (err) {
    // Tools report a friendly "not configured" message if the database is unreachable.
    console.error("[mcp] schema setup failed", err instanceof Error ? err.message : err);
  }

  // Stateless: a fresh server and transport per request, no session ids.
  const server = createVivaServer(userFrom(req));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    // Room for a compressed photo of notes (read_notes_photo); Vercel caps request bodies at 4.5 MB.
    maxRequestBodySize: 4_500_000,
  });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (err) {
    console.error("[mcp] transport error", err);
    return jsonError(500, -32603, "Internal server error.");
  } finally {
    // With JSON responses the body is fully built before handleRequest returns, so closing here is safe.
    void server.close();
  }
}

export async function POST(req: Request) {
  return handle(req);
}

// Stateless server: no standalone SSE stream and no sessions to delete.
export async function GET() {
  return jsonError(405, -32000, "Method not allowed. This server is stateless; send JSON-RPC over POST.");
}

export async function DELETE() {
  return jsonError(405, -32000, "Method not allowed. This server is stateless.");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
