import { loadCatalog } from "@/lib/loja-catalog";
import { STORE } from "@/app/loja/_lib/catalog";

/*
 * Public support contact for the serial portal (public/index.html), which
 * is static and can't read D1 itself. One source of truth: the same
 * WhatsApp and hours the admin sets in Loja → Configurações, already
 * sanitized by the catalog registry (STORE). whatsappUrl is "" when none
 * is configured, and the portal then hides its WhatsApp button.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await loadCatalog();
    return Response.json(
      { whatsappUrl: STORE.whatsappUrl, supportHours: STORE.supportHours },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch {
    return Response.json({ whatsappUrl: "", supportHours: "" }, { status: 503 });
  }
}
