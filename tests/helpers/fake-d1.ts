import { DatabaseSync } from "node:sqlite";

/**
 * Minimal D1Database-shaped wrapper around Node's built-in synchronous
 * SQLite, covering only what app code uses (prepare/bind/first/run/all and
 * batch). Real SQLite semantics (RETURNING, GLOB, json1, CHECK
 * constraints) all work, so tests exercise the actual SQL the app sends
 * instead of a hand-rolled approximation of it.
 *
 * `batch()` runs its statements in a tight synchronous loop with no `await`
 * between them, mirroring D1's guarantee that a batch commits as one
 * indivisible unit relative to other requests — which is exactly the
 * property the race-condition tests rely on.
 */
export function createFakeD1() {
  const raw = new DatabaseSync(":memory:");

  function makeStatement(sql: string, boundArgs: unknown[] = []) {
    return {
      bind(...args: unknown[]) {
        return makeStatement(sql, args);
      },
      async first<T>() {
        return (raw.prepare(sql).get(...(boundArgs as never[])) ?? null) as T | null;
      },
      run() {
        const info = raw.prepare(sql).run(...(boundArgs as never[]));
        return Promise.resolve({ meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) }, success: true, results: [] });
      },
      runSync() {
        const info = raw.prepare(sql).run(...(boundArgs as never[]));
        return { meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) }, success: true, results: [] };
      },
      async all<T>() {
        return { results: raw.prepare(sql).all(...(boundArgs as never[])) as T[], success: true, meta: {} };
      },
    };
  }

  return {
    raw,
    exec(sql: string) {
      raw.exec(sql);
    },
    prepare(sql: string) {
      return makeStatement(sql);
    },
    batch(statements: ReturnType<typeof makeStatement>[]) {
      const results = statements.map((statement) => statement.runSync());
      return Promise.resolve(results);
    },
  };
}

export type FakeD1 = ReturnType<typeof createFakeD1>;
