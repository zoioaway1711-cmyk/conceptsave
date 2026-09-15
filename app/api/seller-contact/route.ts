import { getSession } from '@/lib/sessions';
import { getDatabase } from '@/db/client';
import { refreshProfile } from '@/lib/verification-service';
export async function GET(request:Request) {
 const session=await getSession(request,'customer');
 if(!session) return Response.json({error:'unauthorized'},{status:401});
 const profile=await refreshProfile(getDatabase(),session.profileId);
 if(!profile || profile.blocked || !profile.activeSerials.length) return Response.json({error:'activation_required'},{status:403});
 const phone=process.env.SELLER_WHATSAPP ?? '5511979575223';
 if(!/^[1-9]\d{9,14}$/.test(phone)) return Response.json({url:null});
 return Response.json({url:`https://wa.me/${phone}`});
}
