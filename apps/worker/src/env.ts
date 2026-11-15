import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Local development: load the repository's .env if there is one. Values already set in the
// environment (as on Render) win. Imported first, before anything reads process.env.
const file = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(file)) process.loadEnvFile(file);
