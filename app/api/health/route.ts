import { getDatabase } from '@/db/client';
export async function GET() {
 try {await getDatabase().prepare('SELECT 1').first();return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}
 catch {return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
