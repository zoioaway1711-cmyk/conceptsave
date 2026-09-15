import { getSession } from '@/lib/sessions';
export async function POST(request:Request) {
 if(!await getSession(request,'customer')) return Response.json({error:'unauthorized'},{status:401});
 return Response.json({error:'seller_contact_required',message:'Os códigos são emitidos automaticamente. Entre em contato com seu vendedor para solicitar o benefício.'},{status:409});
}
