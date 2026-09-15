import { getDatabase } from '@/db/client';
import { isAdmin } from '@/lib/admin-auth';
export async function GET(request:Request) {
 if(!await isAdmin(request)) return Response.json({error:'unauthorized'},{status:401});
 const db=getDatabase(), p=new URL(request.url).searchParams;
 const page=Math.max(1,Math.min(100000,Number(p.get('page')) || 1)), size=50;
 const values:unknown[]=[]; const conditions:string[]=[];
 const search=(p.get('q') || '').trim().slice(0,100);
 if(search) { conditions.push("concat_ws(' ',profile_id,serial,product,ip,country,region,city,browser,os,device,host) ILIKE ?"); values.push(`%${search}%`); }
 for(const key of ['action','status','country','profile_id']) if(p.get(key)) {conditions.push(`${key}=?`); values.push(p.get(key)!.slice(0,80));}
 for(const [key,operator] of [['from','>='],['to','<=']]) {
  const value=p.get(key!); if(value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {conditions.push(`activated_at ${operator} ?`);values.push(`${value}T${key==='to'?'23:59:59.999':'00:00:00.000'}Z`);}
 }
 const where=conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
 const customerPage=Math.max(1,Math.floor(Number(p.get('customerPage')) || 1));
 const customerQ=(p.get('customerQ') || '').slice(0,100);
 const customerWhere=customerQ ? " WHERE concat_ws(' ',id,serials_json,level_name,benefits_json) ILIKE ?" : '';
 const customerArgs=customerQ ? [`%${customerQ}%`] : [];
 const [events,totals,profiles,customerTotal] = await Promise.all([
  db.prepare(`SELECT *, profile_id AS profileId, user_agent AS userAgent,metadata_json AS metadataJson,activated_at AS activatedAt,geo_source AS geoSource,request_id AS requestId,request_path AS requestPath FROM verification_events${where} ORDER BY activated_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...values,size,(page-1)*size).all(),
  db.prepare(`SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE status='authentic') AS valid,COUNT(*) FILTER(WHERE credited=1) AS activations,COUNT(DISTINCT NULLIF(ip,'')) AS ips,COUNT(DISTINCT NULLIF(country,'')) AS countries FROM verification_events${where}`).bind(...values).first(),
  db.prepare(`SELECT id,first_seen AS firstSeen,last_active AS lastActive,preferred_language AS preferredLanguage,points,level,level_name AS levelName,benefits_json AS benefitsJson,consent_json AS consentJson,serials_json AS serialsJson,revoked_serials_json AS revokedSerialsJson,verified_at_json AS verifiedAtJson,rank_override AS rankOverride,blocked FROM customer_profiles${customerWhere} ORDER BY last_active DESC LIMIT 100 OFFSET ?`).bind(...customerArgs,(customerPage-1)*100).all(),
  db.prepare(`SELECT COUNT(*) AS total FROM customer_profiles${customerWhere}`).bind(...customerArgs).first(),
 ]);
 const parsedProfiles=profiles.results.map(row=>({...row,benefits:JSON.parse(String(row.benefitsJson)),consent:JSON.parse(String(row.consentJson)),serials:JSON.parse(String(row.serialsJson)),revokedSerials:JSON.parse(String(row.revokedSerialsJson)),verifiedAt:JSON.parse(String(row.verifiedAtJson)),blocked:Boolean(row.blocked)}));
 const records=events.results.map(row=>({...row,id:String(row.id),credited:Boolean(row.credited),metadata:JSON.parse(String(row.metadataJson))}));
 const summary=Object.fromEntries(Object.entries(totals || {}).map(([k,v])=>[k,Number(v)]));
 return Response.json({records,profiles:parsedProfiles,summary,customersPagination:{page:customerPage,pages:Math.max(1,Math.ceil(Number(customerTotal?.total || 0)/100)),total:Number(customerTotal?.total || 0)},pagination:{page,pageSize:size,total:summary.total,pages:Math.max(1,Math.ceil(summary.total/size))}});
}
