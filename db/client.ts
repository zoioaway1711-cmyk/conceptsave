import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

type Row = Record<string, unknown>;
type Query = (sql: string, values?: unknown[]) => Promise<{ rows: Row[]; rowCount?: number | null; affectedRows?: number }>;
// Existing parameterized statements retain their API; PostgreSQL aliases preserve JSON field names.
function sqlForPostgres(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`).replace(/\bAS ([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)/g, 'AS "$1"');
}
export class Database {
  constructor(private query: Query, private transactionRunner?: <T>(fn: (db: Database) => Promise<T>) => Promise<T>) {}
  prepare(sql: string) {
    const query = this.query;
    function statement(values: unknown[] = []) {
      return {
        bind: (...args: unknown[]) => statement(args),
        all: async () => { const result = await query(sqlForPostgres(sql), values); return { results: result.rows }; },
        first: async <T = Row>() => (await query(sqlForPostgres(sql), values)).rows[0] as T | undefined,
        run: async () => { const result = await query(sqlForPostgres(sql), values); return { changes: result.rowCount ?? result.affectedRows ?? 0 }; },
      };
    }
    return statement();
  }
  async batch(statements: ReturnType<Database['prepare']>[]) { return Promise.all(statements.map(statement => statement.all())); }
  async transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> { return this.transactionRunner ? this.transactionRunner(fn) : fn(this); }
}
const state = globalThis as unknown as { vfDatabase?: Database; vfPool?: Pool; vfLocal?: PGlite };
export function getDatabase() {
  if (state.vfDatabase) return state.vfDatabase;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, allowExitOnIdle: true });
    state.vfPool = pool;
    const query = (sql: string, values?: unknown[]) => pool.query(sql, values);
    state.vfDatabase = new Database(query, async fn => {
      const client: PoolClient = await pool.connect();
      try { await client.query('BEGIN'); const result = await fn(new Database((sql, values) => client.query(sql, values))); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    });
  } else {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_DB !== '1') throw new Error('DATABASE_URL não configurada. Conecte um PostgreSQL antes de iniciar.');
    const directory=path.resolve(process.env.LOCAL_PG_DIR || '.local/postgres');
    mkdirSync(path.dirname(directory),{recursive:true});
    const local = new PGlite(directory);
    state.vfLocal = local;
    state.vfDatabase = new Database(async (sql, values) => local.query<Row>(sql, values), async fn => local.transaction(async tx => fn(new Database(async (sql, values) => tx.query<Row>(sql, values)))));
  }
  return state.vfDatabase;
}
export async function closeDatabase() { await state.vfPool?.end(); await state.vfLocal?.close(); state.vfDatabase = undefined; state.vfLocal = undefined; state.vfPool = undefined; }
