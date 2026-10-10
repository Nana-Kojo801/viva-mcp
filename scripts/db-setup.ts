import { db } from "../src/lib/db";
import { SCHEMA } from "../src/lib/schema";

async function main() {
  const client = db();
  await client.batch(SCHEMA, "write");
  console.log(`Schema ready (${SCHEMA.length} statements applied).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
