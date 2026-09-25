import type { Metadata } from "next";
import Link from "next/link";
import { Camera, KeyRound, ScanLine, ShieldCheck, Undo2 } from "lucide-react";
import { Breadcrumbs } from "../_components/ui";

export const metadata: Metadata = {
  title: "Autenticidade",
  description: "Como conferir se o seu produto Save Concept é original: serial e QR Code no selo, verificação no portal oficial.",
};

/* Describes the real verification portal flow (public/index.html + /api/verifications). */
const STEPS = [
  { icon: Undo2, title: "Vire a embalagem", text: "Localize o selo branco na parte traseira do produto." },
  { icon: ScanLine, title: "Encontre o código", text: "O QR Code fica ao centro do selo e o serial completo logo abaixo (ex.: CURA-7K9N-4QPV-8RTW-3HZQ)." },
  { icon: Camera, title: "Verifique no portal", text: "Digite o serial ou use a câmera do celular para ler o QR Code no portal oficial." },
  { icon: KeyRound, title: "Ative o seu acesso", text: "Na primeira validação o produto fica vinculado a você. Cada serial ativa uma única vez." },
];

export default function AutenticidadePage() {
  return (
    <div className="lj-container py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Loja", href: "/loja" }, { label: "Autenticidade" }]} />
      <section className="lj-hero -mx-[var(--lj-gutter)] mt-4 rounded-none px-[var(--lj-gutter)] py-10 sm:rounded-[var(--lj-r-xl)] sm:mx-0 sm:px-10">
        <p className="lj-eyebrow mb-3">Original de fábrica</p>
        <h1 className="lj-h1 max-w-[18ch]">Cada unidade tem um serial único</h1>
        <p className="lj-lead mt-4 max-w-[56ch]">
          Como fabricamos e envasamos tudo em casa, cada unidade sai com serial e QR Code próprios. Em menos de um minuto você confere se
          o seu produto é original — antes de usar.
        </p>
        <Link href="/" className="lj-btn lj-btn--primary lj-btn--lg mt-6">
          <ShieldCheck aria-hidden="true" /> Abrir portal de verificação
        </Link>
      </section>

      <section className="lj-section" aria-labelledby="passos">
        <h2 id="passos" className="lj-h2 mb-6">
          Como verificar
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lj-card lj-card--pad flex flex-col gap-3">
              <span className="flex items-center justify-between">
                <span className="lj-icon-circle">
                  <s.icon aria-hidden="true" />
                </span>
                <span className="lj-display text-3xl font-extrabold text-[color:var(--lj-line-strong)]">{i + 1}</span>
              </span>
              <h3 className="lj-h3 text-[15px]">{s.title}</h3>
              <p className="lj-small lj-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 pb-4 lg:grid-cols-2" aria-label="Dúvidas sobre autenticidade">
        <div className="lj-card lj-card--pad">
          <h2 className="lj-h3 mb-2">O serial já foi usado?</h2>
          <p className="lj-small lj-muted">
            Como cada serial ativa uma única vez, um código que aparece como já utilizado sem que você o tenha validado é um sinal de
            alerta. Não use o produto e fale com o nosso atendimento informando o serial.
          </p>
        </div>
        <div className="lj-card lj-card--pad">
          <h2 className="lj-h3 mb-2">Seus dados na verificação</h2>
          <p className="lj-small lj-muted">
            Para prevenir fraudes, o portal registra o produto consultado, data, hora, endereço IP e dados técnicos do navegador. Detalhes
            ficam no próprio portal, na seção de privacidade.
          </p>
        </div>
      </section>
    </div>
  );
}
