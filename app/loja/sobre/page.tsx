import type { Metadata } from "next";
import { loadCatalog } from "@/lib/loja-catalog";
import Link from "next/link";
import { FileCheck, FlaskConical, MapPin, Snowflake } from "lucide-react";
import { PRODUCTS, STORE, getProduct } from "../_lib/catalog";
import { Breadcrumbs, ProductImage } from "../_components/ui";

export const metadata: Metadata = {
  title: "Sobre a Save Concept",
  description: "Fabricação própria em Cotia (SP) desde 2019: formulação, envase, controle de lote e envio refrigerado sob o mesmo teto.",
};

/* Brand story — every statement is the brand copy already published on the store home/FAQ. */
const PILLARS = [
  { icon: FlaskConical, title: "Formulação e envase próprios", text: "Não compramos de laboratório terceiro para revender com a nossa marca." },
  { icon: FileCheck, title: "Lote numerado e testado", text: "Toda leva de produção passa por controle interno antes de ser liberada para envio." },
  { icon: Snowflake, title: "Cadeia fria até você", text: "Caixa térmica com gelo reciclável, dimensionada para o trajeto até a sua região." },
  { icon: MapPin, title: `Direto de ${STORE.city}`, text: "Do nosso estoque para a sua casa, com nota fiscal em todo pedido." },
];

export default async function SobrePage() {
  await loadCatalog();
  const image = getProduct("tirzepatida-60mg")!.image;
  return (
    <div className="lj-container py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Loja", href: "/loja" }, { label: "Sobre" }]} />
      <section className="mt-4 grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="lj-eyebrow mb-3">Desde {STORE.since}</p>
          <h1 className="lj-h1 max-w-[16ch]">De um forno de bancada a 50 mil frascos por ano</h1>
          <p className="lj-lead mt-5 max-w-[58ch]">
            Começamos em {STORE.since}, em {STORE.city}, com três formulações e uma estrutura pequena. Hoje testamos cada lote antes de
            liberar o envio — o mesmo cuidado do início, só que em escala maior.
          </p>
          <blockquote className="mt-6 border-l-2 border-[color:var(--lj-primary)] pl-5 text-[17px] italic leading-relaxed text-[color:var(--lj-ink)]">
            “A gente não terceiriza a produção pra depois só colar etiqueta. Se sai daqui com o nome Save Concept, foi a nossa equipe que
            formulou e envasou.”
            <footer className="lj-tiny lj-muted mt-2 font-semibold not-italic">— Equipe de produção Save Concept</footer>
          </blockquote>
        </div>
        <div className="lj-card lj-media aspect-[4/5] p-10">
          <ProductImage image={image} sizes="(max-width: 1023px) 90vw, 480px" priority />
        </div>
      </section>

      <section className="lj-section" aria-labelledby="pilares">
        <h2 id="pilares" className="lj-h2 mb-6">
          O que não abrimos mão
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <li key={p.title} className="lj-card lj-card--pad">
              <span className="lj-icon-circle">
                <p.icon aria-hidden="true" />
              </span>
              <h3 className="lj-h3 mt-3 text-[15px]">{p.title}</h3>
              <p className="lj-small lj-muted mt-1">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lj-card lj-card--pad mb-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="lj-h3">Conheça o catálogo</h2>
          <p className="lj-small lj-muted mt-1">
            {PRODUCTS.length} produtos de marca própria · {STORE.legalName} · CNPJ {STORE.cnpj}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/loja/produtos" className="lj-btn lj-btn--primary">
            Ver produtos
          </Link>
          <Link href="/loja/autenticidade" className="lj-btn lj-btn--secondary">
            Como verificar autenticidade
          </Link>
        </div>
      </section>
    </div>
  );
}
