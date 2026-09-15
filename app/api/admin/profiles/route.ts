import { getDatabase } from '@/db/client';
import { isAdmin } from '@/lib/admin-auth';
import { requestContext } from '@/lib/request-context';
import { refreshProfile, serialPattern } from '@/lib/verification-service';
export async function GET(request:Request) {
 if(!await isAdmin(request)) return Response.json({error:'unauthorized'},{status:401});
 const p=new URL(request.url).searchParams, id=(p.get('id') || '').slice(0,80);
 const db=getDatabase();
 const profile=await refreshProfile(db,id);
 if(!profile) return Response.json({error:'profile_not_found'},{status:404});
 const events=await db.prepare('SELECT *,profile_id AS profileId,user_agent AS userAgent,metadata_json AS metadataJson,activated_at AS activatedAt,geo_source AS geoSource,request_id AS requestId,request_path AS requestPath FROM verification_events WHERE profile_id=? ORDER BY activated_at DESC,id DESC LIMIT 100').bind(id).all();
 const stats=await db.prepare("SELECT COUNT(*) AS total,COUNT(DISTINCT NULLIF(ip,'')) AS ips,COUNT(DISTINCT NULLIF(country,'')) AS countries,MIN(activated_at) AS firstEvent,MAX(activated_at) AS lastEvent FROM verification_events WHERE profile_id=?").bind(id).first();
 return Response.json({profile:{...profile,events:events.results.map(row=>({...row,id:String(row.id),credited:Boolean(row.credited),metadata:JSON.parse(String(row.metadataJson))}))},stats});
}
export async function POST(request:Request) {
 if(!await isAdmin(request)) return Response.json({error:'unauthorized'},{status:401});
 const body=await request.json(), id=String(body.id || '').slice(0,80);
 if(!id || !Array.isArray(body.serials) || body.serials.length>1000 || !Array.isArray(body.revokedSerials)) return Response.json({error:'invalid_profile'},{status:400});
 const serials=[...new Set(body.serials)] as string[], revoked=[...new Set(body.revokedSerials)] as string[];
 if(serials.some(s=>typeof s!=='string' || !serialPattern.test(s)) || revoked.some(s=>!serials.includes(s))) return Response.json({error:'invalid_serials'},{status:400});
 const rank=Number(body.rankOverride || 0);
 if(!Number.isInteger(rank) || rank<0 || rank>5 || typeof body.blocked!=='boolean') return Response.json({error:'invalid_profile'},{status:400});
 try {
 const profile=await getDatabase().transaction(async db=>{
  const old=await db.prepare('SELECT * FROM customer_profiles WHERE id=? FOR UPDATE').bind(id).first();
  if(!old) throw new Error('profile_not_found');
  const now=new Date().toISOString();
  for(const serial of serials) {
   const product=await db.prepare('SELECT serial FROM product_serials WHERE serial=?').bind(serial).first();
   if(!product) throw new Error('product_not_found');
   const claim=await db.prepare('SELECT profile_id FROM serial_claims WHERE serial=?').bind(serial).first();
   if(claim && claim.profile_id!==id) throw new Error('serial_already_claimed');
   await db.prepare('INSERT INTO serial_claims(serial,profile_id,activated_at) VALUES(?,?,?) ON CONFLICT(serial) DO NOTHING').bind(serial,id,now).run();
   const owner=await db.prepare('SELECT profile_id FROM serial_claims WHERE serial=?').bind(serial).first();
   if(owner?.profile_id!==id) throw new Error('serial_already_claimed');
  }
  // Existing ownership is immutable here: revoke a serial rather than deleting its history.
  await db.prepare('UPDATE customer_profiles SET rank_override=?,blocked=?,revoked_serials_json=? WHERE id=?').bind(rank,body.blocked?1:0,JSON.stringify(revoked),id).run();
  if(body.blocked) await db.prepare("DELETE FROM sessions WHERE role='customer' AND profile_id=?").bind(id).run();
  const result=await refreshProfile(db,id,true), c=requestContext(request);
  await db.prepare("INSERT INTO admin_audit_events(action,target_type,target_id,details_json,ip,user_agent,created_at) VALUES('profile_updated','customer',?,?,?,?,?)").bind(id,JSON.stringify({rankOverride:rank,blocked:body.blocked,revokedSerials:revoked,serials}),c.ip,c.userAgent,now).run();
  return result;
 });
 return Response.json({saved:true,profile});
 } catch(error) {
  if(error instanceof Error && ['profile_not_found','product_not_found','serial_already_claimed'].includes(error.message)) return Response.json({error:error.message},{status:409});
  throw error;
 }
}
