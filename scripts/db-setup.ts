import { ensureSchema } from "../src/lib/db";

ensureSchema()
  .then(() => console.log("Schema ready."))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
