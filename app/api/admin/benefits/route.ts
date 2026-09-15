import { isAdmin } from '@/lib/admin-auth';
import { getDatabase } from '@/db/client';
import { audit } from '@/lib/monitoring';
import { refreshProfile } from '@/lib/verification-service';
export async function POST(request:Request) {
 if(!await isAdmin(request)) return Response.json({error:'unauthorized'},{status:401});
 const body=await request.json();
 if(typeof body.profileId!=='string' || typeof body.code!=='string') return Response.json({error:'invalid_request'},{status:400});
 const result=await getDatabase().transaction(async db=>{
  const row=await db.prepare('SELECT id FROM customer_profiles WHERE id=? FOR UPDATE').bind(body.profileId).first();
  if(!row)return {error:'profile_not_found'};
  const profile=await refreshProfile(db,body.profileId);
  const reward=profile?.benefits.find(b=>b.code===body.code);
  if(!reward)return {error:'code_not_found'};
  if(reward.redeemedAt)return {recorded:true,alreadyRecorded:true};
  if(!reward.eligible)return {error:'reward_ineligible'};
  const now=new Date().toISOString();
  await db.prepare('UPDATE benefit_claims SET redeemed_at=? WHERE profile_id=? AND code=? AND redeemed_at IS NULL').bind(now,body.profileId,body.code).run();
  await audit(request,'bonus_redeemed','customer',body.profileId,{code:body.code,rank:reward.rank,threshold:reward.threshold,confirmedBy:'admin'},db);
  await refreshProfile(db,body.profileId,true);
  return {recorded:true};
 });
 return Response.json(result,{status:'error' in result?409:200});
}
