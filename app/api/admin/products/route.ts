import { getDatabase } from '@/db/client';
import { audit } from '@/lib/monitoring';
import { isAdmin } from '@/lib/admin-auth';
import { serialPattern,refreshProfile } from '@/lib/verification-service';
export async function GET(request:Request) {
 if(!await isAdmin(request)) return Response.json({error:'unauthorized'},{status:401});
 const result=await getDatabase().prepare('SELECT serial,name,maker,brand,lot,expiry,status,created_at AS createdAt,updated_at AS updatedAt FROM product_serials ORDER BY updated_at DESC LIMIT 10000').all();
 return Response.json({products:result.results});
}
export async function POST(request:Request) {
 if(!await isAdmin(request)) return Response.json({error:'unauthorized'},{status:401});
 const body=await request.json(),raw=Array.isArray(body.products)?body.products:[body.product || body];
 if(!raw.length || raw.length>500) return Response.json({error:'invalid_products'},{status:400});
 const products=raw.map((input:Record<string,unknown>)=>{
  if(!input || typeof input!=='object') return null;
  return {serial:String(input.serial || ''),name:String(input.name || '').trim().slice(0,180),maker:String(input.maker || '').slice(0,160),brand:String(input.brand || '').slice(0,100),lot:String(input.lot || '').slice(0,80),expiry:String(input.expiry || '').slice(0,30),status:input.status};
 });
 if(products.some((p:Record<string,unknown> | null)=>!p || !serialPattern.test(String(p.serial)) || !p.name || !['authentic','invalid'].includes(String(p.status)))) return Response.json({error:'invalid_product'},{status:400});
 const now=new Date().toISOString();
 await getDatabase().transaction(async db=>{
  for(const product of products) {
   const before=await db.prepare('SELECT serial,name,maker,brand,lot,expiry,status FROM product_serials WHERE serial=? FOR UPDATE').bind(product.serial).first();
   await db.prepare("INSERT INTO product_serials(serial,name,maker,brand,lot,expiry,status,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'admin') ON CONFLICT(serial) DO UPDATE SET name=excluded.name,maker=excluded.maker,brand=excluded.brand,lot=excluded.lot,expiry=excluded.expiry,status=excluded.status,updated_at=excluded.updated_at,updated_by='admin'").bind(product.serial,product.name,product.maker,product.brand,product.lot,product.expiry,product.status,now,now).run();
   await audit(request,before?'product_updated':'product_created','product',product.serial,{evidence:'server',before:before || null,after:product},db);
   const owner=await db.prepare('SELECT profile_id FROM serial_claims WHERE serial=?').bind(product.serial).first<{profile_id:string}>();
   if(owner) await refreshProfile(db,owner.profile_id,true);
  }
 });
 return Response.json({saved:products.length});
}
