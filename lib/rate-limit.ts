import { createHash } from 'node:crypto';
import { getDatabase } from '../db/client';
import { requestContext } from './request-context';
export async function rateLimit(request: Request, scope: string, max: number, seconds=900) {
 const now = Date.now(), window = seconds * 1000, bucket = Math.floor(now/window);
 const ip = requestContext(request).ip || 'local';
 const key = `${scope}:${bucket}:${createHash('sha256').update(ip).digest('hex')}`;
 const db = getDatabase();
 await db.prepare('DELETE FROM admin_login_limits WHERE expires_at < ?').bind(now).run();
 const row = await db.prepare('INSERT INTO admin_login_limits(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=admin_login_limits.attempts+1 RETURNING attempts').bind(key,(bucket+1)*window).first<{attempts:number}>();
 return !row || row.attempts > max ? Response.json({error:'too_many_attempts'}, {status:429,headers:{'Retry-After':String(Math.ceil(((bucket+1)*window-now)/1000))}}) : null;
}
