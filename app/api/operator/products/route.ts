import { staffIdentity } from '@/lib/operators';
import { getDatabase } from '@/db/client';
import { audit } from '@/lib/monitoring';
import { serialPattern } from '@/lib/verification-service';
export async function POST(request:Request) {
 const staff=await staffIdentity(request);if(!staff)return Response.json({error:'forbidden'},{status:403});
 const b=await request.json();
 if(typeof b.serial!=='string'||!serialPattern.test(b.serial)||typeof b.name!=='string'||!b.name.trim()||b.name.length>180||(b.status!==undefined&&b.status!=='authentic'))return Response.json({error:'invalid_product'},{status:400});
 const now=new Date().toISOString();
 const created=await getDatabase().transaction(async db=>{
  const row=await db.prepare("INSERT INTO product_serials(serial,name,maker,brand,lot,expiry,status,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,'authentic',?,?,?) ON CONFLICT(serial) DO NOTHING RETURNING serial").bind(b.serial,b.name.trim(),String(b.maker||'').slice(0,160),String(b.brand||'Save Concept').slice(0,100),String(b.lot||'').slice(0,80),String(b.expiry||'').slice(0,30),now,now,staff.id).first();
  if(row)await audit(request,'product_created','product',b.serial,{actor:staff.id,role:staff.role},db);
  return !!row;
 });return Response.json({created},{status:created?201:409});
}
