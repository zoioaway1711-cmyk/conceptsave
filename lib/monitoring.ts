import { createHash } from 'node:crypto';
import { Database, getDatabase } from '../db/client';
import { getSession } from './sessions';
import { requestContext } from './request-context';
export async function sessionReference(request: Request) {
 const session = await getSession(request, 'customer');
 if (!session) return '';
 const token = request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('vf_customer='))?.slice(12) || '';
 // Domain-separated reference cannot be used as a login cookie or database token hash.
 return createHash('sha256').update(`monitoring:${token}`).digest('hex').slice(0,24);
}
export async function audit(request: Request, action: string, targetType: string, targetId: string, details: unknown, db: Database = getDatabase()) {
 const c = requestContext(request);
 await db.prepare('INSERT INTO admin_audit_events(action,target_type,target_id,details_json,ip,user_agent,created_at) VALUES(?,?,?,?,?,?,?)')
 .bind(action,targetType,targetId,JSON.stringify(details),c.ip,c.userAgent,new Date().toISOString()).run();
}
