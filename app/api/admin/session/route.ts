import { operatorLogin, staffIdentity } from '@/lib/operators';
import { validCredentials } from '@/lib/admin-auth';
import { createSession, deleteSession } from '@/lib/sessions';
import { rateLimit } from '@/lib/rate-limit';
import { logEvent } from '@/lib/verification-service';
export async function GET(request: Request) {
 const staff = await staffIdentity(request);
 return Response.json({authenticated:!!staff,role:staff?.role},{status:staff ? 200 : 401});
}
export async function POST(request: Request) {
 const limited = await rateLimit(request,'admin-login',10); if (limited) return limited;
 const body = await request.json();
 const valid = typeof body.user === 'string' && typeof body.password === 'string' && body.user.length <= 100 && body.password.length <= 1024 && validCredentials(body.user.trim(),body.password);
 const operatorId=!valid && typeof body.user==='string' && typeof body.password==='string' && body.password.length<=1024 ? await operatorLogin(body.user.trim(),body.password) : null;
 await logEvent(request, {profileId:operatorId || 'admin',serial:'',action:'admin_login',source:'manual',status:valid || operatorId ? 'success' : 'denied'});
 if (!valid && !operatorId) return Response.json({error:'invalid_credentials'},{status:401});
 await deleteSession(request,'admin');
 return Response.json({authenticated:true,role:valid?'admin':'operator'},{headers:{'set-cookie':await createSession('admin',operatorId)}});
}
export async function DELETE(request: Request) { return Response.json({authenticated:false},{headers:{'set-cookie':await deleteSession(request,'admin')}}); }
