import { randomUUID } from 'node:crypto';
import { isAdmin } from '@/lib/admin-auth';
import { hashOperatorPassword } from '@/lib/operators';
import { getDatabase } from '@/db/client';
import { audit } from '@/lib/monitoring';
export async function GET(request:Request) {
 if(!await isAdmin(request))return Response.json({error:'forbidden'},{status:403});
 return Response.json({operators:(await getDatabase().prepare('SELECT id,username,active,created_at FROM operators ORDER BY created_at DESC').all()).results});
}
export async function POST(request:Request) {
 if(!await isAdmin(request))return Response.json({error:'forbidden'},{status:403});
 const body=await request.json();const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
 if(!/^[a-z0-9._-]{3,60}$/.test(username)||username===(process.env.ADMIN_USER||'admin').toLowerCase()||password.length<12||password.length>128)return Response.json({error:'invalid_input'},{status:400});
 const id=randomUUID();
 const created=await getDatabase().transaction(async db=>{
  const result=await db.prepare('INSERT INTO operators(id,username,password_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(username) DO NOTHING RETURNING id').bind(id,username,hashOperatorPassword(password),new Date().toISOString()).first();
  if(result)await audit(request,'operator_created','operator',id,{username,role:'create_products_only'},db);
  return !!result;
 });
 return Response.json({created},{status:created?201:409});
}
export async function PATCH(request:Request) {
 if(!await isAdmin(request))return Response.json({error:'forbidden'},{status:403});
 const body=await request.json();if(typeof body.active!=='boolean'||typeof body.id!=='string')return Response.json({error:'invalid_input'},{status:400});
 await getDatabase().transaction(async db=>{
  await db.prepare('UPDATE operators SET active=? WHERE id=?').bind(body.active?1:0,body.id).run();
  if(!body.active)await db.prepare("DELETE FROM sessions WHERE role='admin' AND profile_id=?").bind(body.id).run();
  await audit(request,'operator_access_changed','operator',body.id,{active:body.active},db);
 });return Response.json({saved:true});
}

export async function DELETE(request:Request) {
 if(!await isAdmin(request))return Response.json({error:'forbidden'},{status:403});
 const body=await request.json();if(typeof body.id!=='string')return Response.json({error:'invalid_input'},{status:400});
 const removed=await getDatabase().transaction(async db=>{
  const row=await db.prepare('DELETE FROM operators WHERE id=? RETURNING username').bind(body.id).first<{username:string}>();
  if(!row)return false;
  await db.prepare("DELETE FROM sessions WHERE role='admin' AND profile_id=?").bind(body.id).run();
  await audit(request,'operator_removed','operator',body.id,{username:row.username},db);
  return true;
 });return Response.json(removed?{removed:true}:{error:'not_found'},{status:removed?200:404});
}
