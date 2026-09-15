import { rewardCatalog, rankStarts } from './reward-catalog';
import { sessionReference } from './monitoring';
import { randomBytes } from 'node:crypto';
import { Database, getDatabase } from '../db/client';
import { requestContext, clientMetadata, consentedLocation } from './request-context';
export const serialPattern = /^(?:\d{5}|\d{6}|\d{8})$/;
const levels = [{name:'Bronze',points:0},{name:'Prata',points:1000},{name:'Ouro',points:2000},{name:'Platina',points:3000},{name:'Diamante',points:5000}];
export type Product = {serial:string;name:string;maker:string;lot:string;expiry:string;status:string;brand:string};
type Event = {profileId:string;serial:string;action:string;source:string;status:string;credited?:boolean;product?:Product;metadata?:unknown;details?:unknown;sessionRef?:string};
export async function logEvent(request: Request, event: Event, db=getDatabase()) {
 const c = consentedLocation(request,event.metadata);
 const metadata = {...clientMetadata(event.metadata), sessionReference:event.sessionRef ?? await sessionReference(request), serverDetails:event.details || null, activationTimezone:c.timezone, timezoneSource:c.timezone ? 'vercel-ip' : 'unavailable'};
 const source = ['manual','qr-camera','qr-image','qr-link'].includes(event.source) ? event.source : 'manual';
 await db.prepare(`INSERT INTO verification_events(profile_id,serial,product,maker,lot,status,credited,action,source,ip,country,region,city,latitude,longitude,geo_source,user_agent,browser,os,device,request_id,host,request_path,referrer,metadata_json,activated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(event.profileId,event.serial,event.product?.name || '',event.product?.maker || '',event.product?.lot || '',event.status,event.credited ? 1:0,event.action,source,c.ip,c.country,c.region,c.city,c.latitude,c.longitude,c.geoSource,c.userAgent,c.browser,c.os,c.device,c.requestId,c.host,c.requestPath,c.referrer,JSON.stringify(metadata),new Date().toISOString()).run();
}
export async function refreshProfile(db: Database, id:string, persist=false) {
 const row = await db.prepare('SELECT * FROM customer_profiles WHERE id=?').bind(id).first();
 if (!row) return null;
 const revoked: string[] = JSON.parse(String(row.revoked_serials_json || '[]'));
 const claims = await db.prepare('SELECT c.serial,c.activated_at,c.activation_timezone AS activationTimezone,c.activation_city AS activationCity,p.name,p.maker,p.brand,p.lot,p.expiry,p.status FROM serial_claims c JOIN product_serials p ON p.serial=c.serial WHERE c.profile_id=? ORDER BY c.activated_at DESC').bind(id).all();
 const active = claims.results.filter(x => x.status==='authentic' && !revoked.includes(String(x.serial)));
 const points = active.length * 100;
 const rank = Number(row.rank_override) || Math.max(1,levels.filter(level => points >= level.points).length);
 if(persist && !row.blocked) {
  for(let cycle=1;cycle<=rank;cycle++) for(const reward of rewardCatalog(cycle)) {
   if(active.length<rankStarts[cycle-1]+reward.threshold) continue;
   const issued=await db.prepare('INSERT INTO benefit_claims(profile_id,rank,threshold,code,title,activated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(profile_id,rank,threshold) DO NOTHING RETURNING code').bind(id,cycle,reward.threshold,`SAVE-${randomBytes(10).toString('hex').toUpperCase()}`,reward.title,new Date().toISOString()).first();
   if(issued) await db.prepare("INSERT INTO admin_audit_events(action,target_type,target_id,details_json,created_at) VALUES('bonus_code_issued','customer',?,?,?)").bind(id,JSON.stringify({code:issued.code,rank:cycle,threshold:reward.threshold,delivery:'seller_contact'}),new Date().toISOString()).run();
  }
  for(let target=2;target<=rank;target++) {const issued=await db.prepare('INSERT INTO rank_codes(profile_id,rank,code,created_at) VALUES(?,?,?,?) ON CONFLICT(profile_id,rank) DO NOTHING RETURNING code').bind(id,target,`RANK-${randomBytes(10).toString('hex').toUpperCase()}`,new Date().toISOString()).first();
  if(issued) await db.prepare("INSERT INTO admin_audit_events(action,target_type,target_id,details_json,created_at) VALUES('rank_code_issued','customer',?,?,?)").bind(id,JSON.stringify({code:issued.code,rank:target,delivery:'seller_contact'}),new Date().toISOString()).run();}
 }
 const rankCodes=(await db.prepare('SELECT rank,code,created_at AS createdAt FROM rank_codes WHERE profile_id=? ORDER BY rank').bind(id).all()).results.map(item=>({...item,title:levels[Number(item.rank)-1].name,eligible:!row.blocked && rank>=Number(item.rank)}));
 const benefits = (await db.prepare('SELECT rank,threshold,code,title,redeemed_at AS redeemedAt,activated_at AS activatedAt FROM benefit_claims WHERE profile_id=? ORDER BY rank,threshold').bind(id).all()).results as Array<{rank:number;threshold:number;code:string;title:string;redeemedAt:string|null;activatedAt:string}>;
 const verifiedAt = Object.fromEntries(claims.results.map(x => [x.serial,x.activated_at]));
 if(persist) await db.prepare('UPDATE customer_profiles SET points=?,level=?,level_name=?,serials_json=?,verified_at_json=?,benefits_json=? WHERE id=?').bind(points,rank,levels[rank-1].name,JSON.stringify(claims.results.map(x=>x.serial)),JSON.stringify(verifiedAt),JSON.stringify(benefits),id).run();
 return {id,firstSeen:row.first_seen,lastActive:row.last_active,preferredLanguage:row.preferred_language,points,level:rank,levelName:levels[rank-1].name,rankOverride:Number(row.rank_override),blocked:Boolean(row.blocked),serials:claims.results.map(x=>x.serial),activeSerials:active.map(x=>x.serial),verifiedAt,benefits:benefits.map(item=>({...item,eligible:!row.blocked && rank>=Number(item.rank) && active.length>=rankStarts[Number(item.rank)-1]+Number(item.threshold) && !item.redeemedAt})),rankCodes,rewardCycle:{rank,products:Math.max(0,active.length-rankStarts[rank-1]),catalog:rewardCatalog(rank)},consent:JSON.parse(String(row.consent_json || '{}')),revokedSerials:revoked,products:claims.results};
}
export async function activate(request:Request, id:string, serial:string, action:'login'|'verification', source:string, metadata:unknown) {
 const sessionRef=await sessionReference(request);
 return getDatabase().transaction(async db => {
  // Serialize ownership decisions per serial; unique serial_claims prevents double credit across accounts.
  const product = await db.prepare('SELECT * FROM product_serials WHERE serial=? FOR UPDATE').bind(serial).first<Product>();
  let status = !product ? 'not_found' : product.status;
  const profile = await db.prepare('SELECT * FROM customer_profiles WHERE id=? FOR UPDATE').bind(id).first();
  if (profile?.blocked) status='blocked';
  if (profile && JSON.parse(String(profile.revoked_serials_json || '[]')).includes(serial)) status='revoked';
  let credited=false;
  if (status==='authentic' && product) {
   const now = new Date().toISOString();
   const consent = clientMetadata(metadata).consent;
   await db.prepare('INSERT INTO customer_profiles(id,first_seen,last_active,consent_json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_active=excluded.last_active,consent_json=excluded.consent_json').bind(id,now,now,JSON.stringify(consent)).run();
   const claimed = await db.prepare('SELECT profile_id FROM serial_claims WHERE serial=?').bind(serial).first();
   if (claimed && claimed.profile_id!==id) status='already_claimed';
   else if (!claimed) {
    const location=consentedLocation(request,metadata);
    await db.prepare('INSERT INTO serial_claims(serial,profile_id,activated_at,activation_timezone,activation_city) VALUES(?,?,?,?,?)').bind(serial,id,now,location.timezone,location.city).run();
    credited=true;
   }
  }
  await logEvent(request,{profileId:id,serial,action,source,status,product,credited,metadata,sessionRef},db);
  const profileData = await refreshProfile(db,id,true);
  return {status,credited,product:status==='authentic' ? product : null,profile:profileData};
 });
}
