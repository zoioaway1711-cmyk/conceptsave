import { readFile } from 'node:fs/promises';
import { getDatabase, closeDatabase } from '../db/client';
const rows = JSON.parse(await readFile(new URL('../database/catalog-seed.json', import.meta.url), 'utf8'));
const db = getDatabase();
try {
 await db.transaction(async tx => {
  const now = new Date().toISOString();
  for (const row of rows) await tx.prepare('INSERT INTO product_serials(serial,name,maker,brand,lot,expiry,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(serial) DO NOTHING').bind(row.serial,row.name,row.maker || '',row.brand || '',row.lot || '',row.expiry || '',row.status,now,now).run();
 });
 console.log('Catálogo importado sem sobrescrever produtos existentes.');
} finally { await closeDatabase(); }
