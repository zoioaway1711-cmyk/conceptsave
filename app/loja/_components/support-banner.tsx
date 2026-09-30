import Link from "next/link";
import { Headset, MessageCircle, ShieldCheck } from "lucide-react";
import { STORE } from "../_lib/catalog";

/*
 * General customer service, shown above every product listing: questions,
 * order follow-up and help with the authenticity check. It uses the store's
 * WhatsApp from Painel → Loja → Configurações. Without one set, it points to
 * the help page instead of hiding, so support is always one tap away.
 */
export function SupportBanner() {
  const hours = STORE.supportHours ? ` · ${STORE.supportHours}` : "";
  return (
    <section className="lj-card mb-6 flex flex-col gap-4 p-5 sm:mb-8 sm:p-6 md:flex-row md:items-center md:justify-between" aria-labelledby="support-banner-title">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--lj-primary-soft)] text-[color:var(--lj-primary)]">
          <Headset className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="support-banner-title" className="lj-h3 text-[18px] sm:text-[20px]">
            Precisa de ajuda? Fale com o atendimento
          </h2>
          <p className="lj-small lj-muted mt-1 max-w-[56ch]">
            Tire dúvidas, acompanhe seu pedido ou peça suporte para verificar a autenticidade do seu produto{hours}.
          </p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:shrink-0">
        {STORE.whatsappUrl ? (
          <a href={STORE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="lj-btn lj-btn--primary lj-btn--lg lj-btn--support">
            <MessageCircle aria-hidden="true" /> Atendimento no WhatsApp<span className="lj-sr-only"> (abre em nova aba)</span>
          </a>
        ) : (
          <Link href="/loja/ajuda" className="lj-btn lj-btn--primary lj-btn--lg lj-btn--support">
            <MessageCircle aria-hidden="true" /> Falar com o atendimento
          </Link>
        )}
        <Link href="/" className="lj-btn lj-btn--secondary lj-btn--lg">
          <ShieldCheck aria-hidden="true" /> Verificar autenticidade
        </Link>
      </div>
    </section>
  );
}
