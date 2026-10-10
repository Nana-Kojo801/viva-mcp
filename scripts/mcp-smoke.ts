// Smoke test for /api/mcp using the official MCP client over Streamable HTTP.
// Usage: npm run mcp:smoke -- [url]   (default http://localhost:3000/api/mcp)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.argv[2] ?? "http://localhost:3000/api/mcp");
const headers: Record<string, string> = { "x-viva-user": `smoke-${Date.now()}` };
if (process.env.MCP_API_KEY) headers.Authorization = `Bearer ${process.env.MCP_API_KEY}`;

async function main() {
  const client = new Client({ name: "viva-smoke", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  await client.connect(transport);
  console.log("protocol:", transport.protocolVersion, "| server:", client.getServerVersion()?.name);

  const { tools } = await client.listTools();
  console.log("tools:", tools.map((t) => t.name).join(", "));

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const s = r.structuredContent as Record<string, unknown> | undefined;
    const text = (r.content as { type: string; text?: string }[])[0]?.text;
    console.log(`\n${name}${r.isError ? " (error)" : ""}: ${s?.spoken ?? text}`);
    return s ?? {};
  };

  const decks = await call("list_decks");
  const deckId = (decks.decks as { id: string }[])[0]?.id;
  const next = await call("get_next_card", { deck_id: deckId });
  const card = next.card as { id: string } | null;
  if (card) await call("submit_answer", { card_id: card.id, answer: "I don't know" });
  await call("set_exam_date", { deck_id: deckId, date: "2026-12-15" });
  await call("get_progress", { timezone: "America/Chicago" });
  await call("get_next_card", { deck_id: "nope" });
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
