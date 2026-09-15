import { randomBytes, createHash } from 'node:crypto';
import { getDatabase } from '../db/client';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const cookieName = (role: string) => role === 'admin' ? 'vf_admin' : 'vf_customer';
export function cookieHeader(role: string, token: string, maxAge: number) {
 const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_DB !== '1';
 return `${cookieName(role)}=${token}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
function tokenFrom(request: Request, role: string) {
 return request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName(role)}=`))?.split('=')[1] || '';
}
export async function createSession(role: 'admin' | 'customer', profileId: string | null = null) {
 const token = randomBytes(32).toString('base64url');
 const duration = role === 'admin' ? 8 * 3600 : 7 * 24 * 3600;
 const db = getDatabase();
 await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
 await db.prepare('INSERT INTO sessions(token_hash,role,profile_id,expires_at,created_at) VALUES(?,?,?,?,?)').bind(hash(token),role,profileId,Date.now()+duration*1000,new Date().toISOString()).run();
 return cookieHeader(role, token, duration);
}
export async function getSession(request: Request, role: 'admin' | 'customer') {
 const token = tokenFrom(request,role);
 if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
 const row = await getDatabase().prepare('SELECT role,profile_id AS profileId FROM sessions WHERE token_hash=? AND role=? AND expires_at>?').bind(hash(token),role,Date.now()).first<{role: string; profileId: string}>();
 return row || null;
}
export async function deleteSession(request: Request, role: 'admin' | 'customer') {
 const token = tokenFrom(request,role);
 if (token) await getDatabase().prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash(token)).run();
 return cookieHeader(role,'',0);
}
