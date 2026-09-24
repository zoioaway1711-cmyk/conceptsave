import { publicOrigin } from "@/lib/public-origin";
/*
 * robots.txt. Keeps crawlers out of the API and the storefront's private
 * or thin pages. The admin console's path is deliberately NOT listed:
 * naming it here would advertise it (it's already noindex + auth-gated).
 */
export function GET(request: Request) {
  const origin = publicOrigin(request);
  const body = [
    "User-agent: *",
    "Disallow: /api/",
    "Disallow: /loja/carrinho",
    "Disallow: /loja/checkout",
    "Disallow: /loja/conta",
    "Disallow: /loja/pedido/",
    "Disallow: /loja/favoritos",
    "Disallow: /loja/busca",
    "",
    `Sitemap: ${origin}/loja/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
