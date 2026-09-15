import { getSession } from '@/lib/sessions';
import { sessionReference } from '@/lib/monitoring';
import { refreshProfile, logEvent } from '@/lib/verification-service';
import { getDatabase } from '@/db/client';
import { clientMetadata } from '@/lib/request-context';
export async function GET(request:Request) {
 const session=await getSession(request,'customer');
 if(!session) return Response.json({error:'unauthorized'},{status:401});
 const requested=new URL(request.url).searchParams.get('id');
 if(requested && requested!==session.profileId) return Response.json({error:'forbidden'},{status:403});
 return Response.json({profile:await refreshProfile(getDatabase(),session.profileId)});
}
export async function POST(request:Request) {
 const session=await getSession(request,'customer');
 if(!session) return Response.json({error:'unauthorized'},{status:401});
 const body=await request.json();
 const consent=clientMetadata({consent:body.consent}).consent;
 const db=getDatabase();
 const sessionRef=await sessionReference(request);
 const updated=await db.transaction(async tx=>{
  const before=await tx.prepare('SELECT preferred_language,consent_json,blocked FROM customer_profiles WHERE id=? FOR UPDATE').bind(session.profileId).first();
  if(!before || before.blocked) return false;
  const language=['pt','en','es'].includes(body.preferredLanguage)?body.preferredLanguage:'pt';
  await tx.prepare('UPDATE customer_profiles SET preferred_language=?,consent_json=? WHERE id=?').bind(language,JSON.stringify(consent),session.profileId).run();
  if(before.preferred_language!==language || before.consent_json!==JSON.stringify(consent)) await logEvent(request,{profileId:session.profileId,serial:'',action:'preferences',source:'manual',status:'success',sessionRef,details:{before:{language:before.preferred_language,consent:JSON.parse(String(before.consent_json))},after:{language,consent}}},tx);
  return true;
 });
 if(!updated) return Response.json({error:'blocked'},{status:403});
 return Response.json({profile:await refreshProfile(db,session.profileId)});
}
