import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Nạp .env.local cho integration test (Next tự làm việc này khi chạy app). */
const file = resolve(process.cwd(), ".env.local");

try {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  throw new Error(
    "Không đọc được .env.local. Integration test cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}
