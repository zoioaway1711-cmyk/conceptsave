import { createHash, timingSafeEqual } from 'node:crypto';
import { getSession } from './sessions';
export async function isAdmin(request: Request) { const session=await getSession(request,'admin'); return Boolean(session && !session.profileId); }
export function validCredentials(user: string, password: string) {
 if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) return false;
 const digest = (value: string) => createHash('sha256').update(value).digest();
 return timingSafeEqual(digest(user),digest(process.env.ADMIN_USER)) && timingSafeEqual(digest(password),digest(process.env.ADMIN_PASSWORD));
}
