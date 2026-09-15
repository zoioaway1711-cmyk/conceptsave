import { isAdmin, validCredentials } from '@/lib/admin-auth';
import { createSession, deleteSession } from '@/lib/sessions';
import { rateLimit } from '@/lib/rate-limit';
import { logEvent } from '@/lib/verification-service';
export async function GET(request: Request) {
 const authenticated = await isAdmin(request);
 return Response.json({authenticated},{status:authenticated ? 200 : 401});
}
export async function POST(request: Request) {
 const limited = await rateLimit(request,'admin-login',10); if (limited) return limited;
 const body = await request.json();
 const valid = typeof body.user === 'string' && typeof body.password === 'string' && body.user.length <= 100 && body.password.length <= 1024 && validCredentials(body.user.trim(),body.password);
 await logEvent(request, {profileId:'admin',serial:'',action:'admin_login',source:'manual',status:valid ? 'success' : 'denied'});
 if (!valid) return Response.json({error:'invalid_credentials'},{status:401});
 await deleteSession(request,'admin');
 return Response.json({authenticated:true},{headers:{'set-cookie':await createSession('admin')}});
}
export async function DELETE(request: Request) { return Response.json({authenticated:false},{headers:{'set-cookie':await deleteSession(request,'admin')}}); }
