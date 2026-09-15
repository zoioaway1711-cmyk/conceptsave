import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '../db/client';
import { getSession } from './sessions';
export function hashOperatorPassword(password:string) {
 const salt=randomBytes(16).toString('hex');
 return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
export async function operatorLogin(username:string,password:string) {
 const row=await getDatabase().prepare('SELECT id,password_hash FROM operators WHERE username=? AND active=1').bind(username.toLowerCase()).first<{id:string;password_hash:string}>();
 const [salt,hash]=(row?.password_hash || '00000000000000000000000000000000:'+ '00'.repeat(64)).split(':');
 const valid=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'));
 return row && valid ? row.id : null;
}
export async function staffIdentity(request:Request) {
 const session=await getSession(request,'admin');
 if(!session)return null;
 if(!session.profileId)return {role:'admin' as const,id:'admin'};
 const operator=await getDatabase().prepare('SELECT id,username FROM operators WHERE id=? AND active=1').bind(session.profileId).first<{id:string;username:string}>();
 return operator ? {role:'operator' as const,...operator} : null;
}
