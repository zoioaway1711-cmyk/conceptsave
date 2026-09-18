import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { FakeD1 } from "./fake-d1";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../drizzle");

/** Applies every generated drizzle migration, in order, to a fake D1 instance — the real schema, including the CHECK constraints, indexes, and the 12-step SQLite table-rebuild steps drizzle-kit emits. */
export function applyMigrations(db: FakeD1) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) db.exec(trimmed);
    }
  }
}
