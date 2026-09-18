import { activate, logEvent, serialPattern, refreshProfile } from '@/lib/verification-service';
import { createSession, getSession, deleteSession } from '@/lib/sessions';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getDatabase } from '@/db/client';
async function rateLimit(request: Request, scope: string, limit: number, windowSeconds = 60) {
  const result = await consumeRateLimit(getDatabase() as never, scope, clientIp(request), limit, windowSeconds);
  return result.allowed ? null : rateLimitResponse(result);
}
export async function GET(request: Request) {
 const session = await getSession(request,'customer');
 if (!session) return Response.json({error:'unauthorized'},{status:401});
 const profile = await refreshProfile(getDatabase(),session.profileId);
 if (!profile || profile.blocked) return Response.json({error:'blocked'},{status:403});
 return Response.json({profile});
}
export async function POST(request: Request) {
 try {
 const limited = await rateLimit(request,'customer-login',20); if (limited) return limited;
 const body=await request.json(); const serial=typeof body.serial==='string' ? body.serial.trim() : '';
 if (!serialPattern.test(serial)) {
  await logEvent(request,{profileId:'anonymous',serial:serial.slice(0,8),action:'login',source:body.source,status:'invalid_format',metadata:body.metadata});
  return Response.json({error:'invalid_serial'},{status:400});
 }
 const result = await activate(request,serial,serial,'login',body.source,body.metadata);
 if (result.status!=='authentic') return Response.json({error:'login_denied'},{status:401});
 await deleteSession(request,'customer');
 return Response.json(result,{headers:{'set-cookie':await createSession('customer',serial)}});
 } catch {
  return Response.json({error:'authentication_unavailable'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});
 }
}
export async function DELETE(request:Request) {
 const session=await getSession(request,'customer');
 if(session) await logEvent(request,{profileId:session.profileId,serial:'',action:'logout',source:'manual',status:'success'});
 return Response.json({signedOut:true},{headers:{'set-cookie':await deleteSession(request,'customer')}}); }
