import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__serverDir, ".env") });
dotenv.config();
