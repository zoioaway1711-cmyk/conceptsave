import { getSession } from '@/lib/sessions';
import { activate,serialPattern,logEvent } from '@/lib/verification-service';
import { rateLimit } from '@/lib/rate-limit';
export async function POST(request:Request) {
 const session=await getSession(request,'customer');
 if (!session) return Response.json({error:'unauthorized'},{status:401});
 const limited=await rateLimit(request,'verification',60,60); if(limited) return limited;
 const body=await request.json(); const serial=typeof body.serial==='string' ? body.serial.trim() : '';
 if (!serialPattern.test(serial)) {
  await logEvent(request,{profileId:session.profileId,serial:serial.slice(0,8),action:'verification',source:body.source,status:'invalid_format',metadata:body.metadata});
  return Response.json({error:'invalid_serial'},{status:400});
 }
 return Response.json(await activate(request,session.profileId,serial,'verification',body.source,body.metadata));
}
