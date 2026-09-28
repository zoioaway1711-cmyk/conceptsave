import { loadCatalog } from "@/lib/loja-catalog";
import { publicOrigin } from "@/lib/public-origin";
import { CATEGORIES, PRODUCTS, categoryHref, productHref } from "../_lib/catalog";

/*
 * Storefront sitemap. Built from the request's own origin so it's correct
 * on whichever domain serves the store (saveconcept.online via the proxy,
 * or the Workers hostname) without hardcoding one. Only public, indexable
 * pages are listed — never cart, checkout, account, orders or search.
 */
// Reads D1 and the request's origin, so it must run per request — never be
// prerendered at build time (the Vercel build has no D1 and would fail).
export const dynamic = "force-dynamic";

/** XML text escaping for <loc>: slugs come from the DB-backed catalog, so never trust them to be markup-free. */
function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function GET(request: Request) {
  await loadCatalog();
  const origin = publicOrigin(request);
  const paths = [
    "/loja",
    "/loja/produtos",
    "/loja/ajuda",
    "/loja/sobre",
    "/loja/autenticidade",
    "/loja/privacidade",
    ...CATEGORIES.map((c) => categoryHref(c.slug)),
    ...PRODUCTS.map((p) => productHref(p.slug)),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${xmlEscape(origin + p)}</loc></url>`).join("\n")}
</urlset>
`;
  // private: the body embeds this request's public host, so a shared (edge)
  // cache must never hand one domain's copy to another.
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "private, max-age=3600" } });
}
