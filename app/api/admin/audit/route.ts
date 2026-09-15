import { getDatabase } from "@/db/client";
import { requestContext } from "@/lib/request-context";
import { isAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  if (!(await isAdmin(request))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action || "admin_action").slice(0, 80);
  const targetType = String(body.targetType || "customer").slice(0, 50);
  const targetId = String(body.targetId || "").slice(0, 100);
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.prepare(`INSERT INTO admin_audit_events (action, target_type, target_id, details_json, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(action, targetType, targetId, JSON.stringify(body.details || {}).slice(0, 4000), requestContext(request).ip, (request.headers.get("user-agent") || "").slice(0, 500), now).run();
  return Response.json({ recorded: true, createdAt: now }, { status: 201 });
}

export async function GET(request: Request) {
 if(!await isAdmin(request)) return Response.json({error:'unauthorized'},{status:401});
 const p=new URL(request.url).searchParams;
 const page=Math.max(1,Math.min(100000,Math.floor(Number(p.get('page')) || 1)));
 const q=(p.get('q') || '').trim().slice(0,100);
 const where=q ? " WHERE concat_ws(' ',action,target_type,target_id,details_json) ILIKE ?" : '';
 const values=q ? [`%${q}%`] : [];
 const db=getDatabase();
 const [rows,count]=await Promise.all([
  db.prepare(`SELECT * FROM admin_audit_events${where} ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ?`).bind(...values,(page-1)*30).all(),
  db.prepare(`SELECT COUNT(*) AS total FROM admin_audit_events${where}`).bind(...values).first(),
 ]);
 return Response.json({records:rows.results.map(r=>({...r,details:JSON.parse(String(r.details_json))})),page,pages:Math.max(1,Math.ceil(Number(count?.total || 0)/30)),total:Number(count?.total || 0)});
}
