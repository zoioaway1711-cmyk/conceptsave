import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, MessageCircle, Package, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { STORE, faq, offeredPayments } from "../_lib/catalog";
import { loadCatalog } from "@/lib/loja-catalog";
import { FaqList } from "../_components/sections";
import { Breadcrumbs, JsonLd } from "../_components/ui";

export const metadata: Metadata = {
  title: "Central de ajuda",
  description: "Entrega, pagamento, trocas e devoluções, acompanhamento de pedidos e verificação de autenticidade na loja Save Concept.",
};

/*
 * Store policies in one place. Every statement comes from STORE/FAQ in
 * catalog.ts (the same source the rest of the store uses), so the help
 * page can never promise something the checkout doesn't do.
 */
const TOPICS = [
  { id: "entrega", icon: Truck, title: "Entrega" },
  { id: "pagamento", icon: CreditCard, title: "Pagamento" },
  { id: "trocas", icon: RotateCcw, title: "Trocas e devoluções" },
  { id: "pedidos", icon: Package, title: "Seu pedido" },
  { id: "autenticidade", icon: ShieldCheck, title: "Autenticidade" },
  { id: "atendimento", icon: MessageCircle, title: "Atendimento" },
];

function Topic({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="lj-card lj-card--pad scroll-mt-40" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="lj-h3 mb-3">
        {title}
      </h2>
      <div className="lj-small flex flex-col gap-2 text-[color:var(--lj-text)]">{children}</div>
    </section>
  );
}

export default async function AjudaPage() {
  await loadCatalog();
  const FAQ = faq();
  return (
    <div className="lj-container py-6 sm:py-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
        }}
      />
      <Breadcrumbs items={[{ label: "Loja", href: "/loja" }, { label: "Central de ajuda" }]} />
      <header className="mb-6 mt-4 max-w-2xl">
        <h1 className="lj-h2 sm:text-[32px]">Central de ajuda</h1>
        <p className="lj-small lj-muted mt-2">Como funcionam entrega, pagamento, trocas e o acompanhamento do seu pedido.</p>
      </header>

      <nav aria-label="Tópicos" className="mb-6">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {TOPICS.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="lj-card flex h-full flex-col items-center gap-2 p-3 text-center text-sm font-semibold text-[color:var(--lj-ink)] hover:shadow-[var(--lj-shadow-md)]">
                <span className="lj-icon-circle">
                  <t.icon aria-hidden="true" />
                </span>
                {t.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Topic id="entrega" title="Entrega">
          <p>
            <strong>Frete grátis</strong> em todos os produtos. Prazo médio de <strong>{STORE.delivery.window}</strong>, conforme o CEP,
            contado a partir da confirmação do pagamento.
          </p>
          <p>{STORE.delivery.detail}</p>
          <p>Itens refrigerados seguem em caixa térmica com gelo reciclável. Enviamos do nosso estoque em {STORE.city}.</p>
        </Topic>
        <Topic id="pagamento" title="Pagamento">
          <p>{STORE.paymentNote}</p>
          <ul className="list-disc pl-5">
            {offeredPayments().map((p) => (
              <li key={p.id}>
                <strong>{p.label}:</strong> {p.detail}
              </li>
            ))}
          </ul>
          <p>Os dados do cartão nunca são pedidos neste site.</p>
        </Topic>
        <Topic id="trocas" title="Trocas e devoluções">
          <p>{STORE.returns}</p>
          <p>Para iniciar, fale com o atendimento informando o número do pedido.</p>
        </Topic>
        <Topic id="pedidos" title="Seu pedido">
          <p>
            Depois de finalizar, você recebe um número (ex.: SC260924-ABCD) e um link para acompanhar o pedido. Esse link fica salvo em{" "}
            <Link href="/loja/conta#pedidos" className="lj-link">
              Minha conta
            </Link>{" "}
            no navegador em que você comprou.
          </p>
          <p>
            Etapas: pedido recebido → pagamento confirmado → em preparação → enviado (com código de rastreio) → entregue. O status só
            muda quando a nossa equipe registra cada etapa.
          </p>
        </Topic>
        <Topic id="autenticidade" title="Autenticidade">
          <p>Cada unidade tem serial e QR Code. Confira a origem no portal de verificação.</p>
          <p>
            <Link href="/" className="lj-btn lj-btn--secondary lj-btn--sm">
              <ShieldCheck aria-hidden="true" /> Verificar autenticidade
            </Link>
          </p>
        </Topic>
        <Topic id="atendimento" title="Atendimento">
          <p>{STORE.supportHours}.</p>
          {STORE.supportEmail && (
            <p>
              E-mail:{" "}
              <a className="lj-link" href={`mailto:${STORE.supportEmail}`}>
                {STORE.supportEmail}
              </a>
            </p>
          )}
          {STORE.whatsappUrl && (
            <p>
              <a className="lj-link" href={STORE.whatsappUrl} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            </p>
          )}
          <p className="lj-muted">
            {STORE.legalName} · CNPJ {STORE.cnpj} · {STORE.city}
          </p>
        </Topic>
      </div>

      <section className="mt-8 max-w-3xl" aria-labelledby="faq-ajuda">
        <h2 id="faq-ajuda" className="lj-h3 mb-3">
          Perguntas frequentes
        </h2>
        <FaqList items={FAQ} />
      </section>
    </div>
  );
}
