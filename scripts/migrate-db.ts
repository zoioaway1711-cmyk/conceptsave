import { readFile, readdir } from 'node:fs/promises';
import { getDatabase, closeDatabase } from '../db/client';
const db = getDatabase();
try {
  await db.prepare('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)').run();
  await db.transaction(async tx => {
    await tx.prepare('SELECT pg_advisory_xact_lock(8102026)').run();
    for (const name of (await readdir(new URL('../database/', import.meta.url))).filter(n => n.endsWith('.sql')).sort()) {
      if (await tx.prepare('SELECT name FROM schema_migrations WHERE name=?').bind(name).first()) continue;
      const sql = await readFile(new URL(`../database/${name}`, import.meta.url), 'utf8');
      // Migrations contain no stored procedures or semicolons within string literals.
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await tx.prepare(statement).run();
      await tx.prepare('INSERT INTO schema_migrations VALUES (?,?)').bind(name, new Date().toISOString()).run();
      console.log(`Migração aplicada: ${name}`);
    }
  });
} finally { await closeDatabase(); }
