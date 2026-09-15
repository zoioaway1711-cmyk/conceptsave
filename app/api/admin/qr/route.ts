import { isAdmin } from '@/lib/admin-auth';
import { getDatabase } from '@/db/client';
import { audit } from '@/lib/monitoring';
import { serialPattern } from '@/lib/verification-service';
export async function POST(request:Request) {
 if(!await isAdmin(request)) return Response.json({error:'unauthorized'},{status:401});
 const body=await request.json();
 if(!serialPattern.test(String(body.serial || '')) || !['view','download'].includes(body.intent)) return Response.json({error:'invalid_request'},{status:400});
 const result=await getDatabase().transaction(async db=>{
  const product=await db.prepare('SELECT serial,name,maker,lot,status FROM product_serials WHERE serial=? FOR UPDATE').bind(body.serial).first();
  if(!product) return null;
  const path=`/index.html?serial=${encodeURIComponent(body.serial)}`;
  await audit(request,'qr_requested','product',body.serial,{evidence:'server',intentDeclaredByBrowser:body.intent,path,product,notice:'Pedido recebido pelo servidor; não confirma impressão ou download concluído.'},db);
  return {path,product};
 });
 return result ? Response.json(result) : Response.json({error:'not_found'},{status:404});
}
