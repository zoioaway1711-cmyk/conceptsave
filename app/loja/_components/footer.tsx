import Image from "next/image";
import Link from "next/link";
import { Barcode, CreditCard, QrCode, ShieldCheck } from "lucide-react";
import { CATEGORIES, PURCHASABLE_OFFERS, STORE, categoryHref } from "../_lib/catalog";
import { PrivacyPreferencesButton } from "./consent-banner";
import { ThemeSwitcher } from "./theme-switcher";

const PAYMENT_ICONS = { pix: QrCode, cartao: CreditCard, boleto: Barcode } as const;

export function StoreFooter() {
  return (
    <footer className="lj-footer">
      <div className="lj-container grid grid-cols-2 gap-8 py-12 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Image src="/save-concept-mark-v2.png" alt="" width={30} height={30} />
            <span className="lj-display text-base font-extrabold">Save Concept</span>
          </div>
          <p className="lj-small lj-muted max-w-xs">
            Fabricação própria em {STORE.city} desde {STORE.since}. Cada unidade pode ter a autenticidade verificada por
            serial ou QR Code.
          </p>
          <Link href="/" className="lj-btn lj-btn--secondary lj-btn--sm self-start">
            <ShieldCheck aria-hidden="true" /> Verificar autenticidade
          </Link>
        </div>

        <nav aria-label="Categorias da loja" className="flex flex-col gap-2">
          <p className="lj-tiny font-bold uppercase tracking-[0.08em] text-[color:var(--lj-ink)]">Loja</p>
          {CATEGORIES.map((c) => (
            <Link key={c.slug} href={categoryHref(c.slug)} className="lj-small lj-muted py-1">
              {c.name}
            </Link>
          ))}
          {PURCHASABLE_OFFERS.length > 0 && (
            <Link href="/loja/ofertas" className="lj-small lj-muted py-1">
              Ofertas
            </Link>
          )}
          <Link href="/loja/produtos" className="lj-small lj-muted py-1">
            Todos os produtos
          </Link>
        </nav>

        <nav aria-label="Ajuda" className="flex flex-col gap-2">
          <p className="lj-tiny font-bold uppercase tracking-[0.08em] text-[color:var(--lj-ink)]">Ajuda</p>
          <Link href="/loja/ajuda" className="lj-small lj-muted py-1">
            Central de ajuda
          </Link>
          <Link href="/loja/ajuda#trocas" className="lj-small lj-muted py-1">
            Trocas e devoluções
          </Link>
          <Link href="/loja/privacidade" className="lj-small lj-muted py-1">
            Privacidade
          </Link>
          <Link href="/loja/carrinho" className="lj-small lj-muted py-1">
            Meu carrinho
          </Link>
          <Link href="/loja/favoritos" className="lj-small lj-muted py-1">
            Favoritos
          </Link>
          <Link href="/loja/conta" className="lj-small lj-muted py-1">
            Minha conta e pedidos
          </Link>
          <PrivacyPreferencesButton />
          <p className="lj-small lj-muted py-1">Atendimento: {STORE.supportHours}</p>
          {STORE.whatsappUrl && (
            <a href={STORE.whatsappUrl} className="lj-small lj-muted py-1" target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          )}
          {STORE.instagramUrl && (
            <a href={STORE.instagramUrl} className="lj-small lj-muted py-1" target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
          )}
        </nav>

        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <p className="lj-tiny font-bold uppercase tracking-[0.08em] text-[color:var(--lj-ink)]">Formas de pagamento</p>
          <ul className="flex flex-wrap gap-2">
            {STORE.payment.map((p) => {
              const Icon = PAYMENT_ICONS[p.id];
              return (
                <li key={p.id} className="lj-badge lj-badge--neutral h-8 px-3 text-xs">
                  <Icon aria-hidden="true" /> {p.label}
                </li>
              );
            })}
          </ul>
          <p className="lj-tiny lj-muted">{STORE.returns}</p>
        </div>
      </div>
      <div className="border-t border-[color:var(--lj-line)]">
        <div className="lj-container flex flex-col-reverse items-start justify-between gap-3 py-5 sm:flex-row sm:items-center">
        <p className="lj-tiny lj-muted">
          © {new Date().getFullYear()} {STORE.legalName} — CNPJ {STORE.cnpj} · {STORE.city}, Brasil. Todos os direitos
          reservados.
        </p>
        <ThemeSwitcher />
        </div>
      </div>
    </footer>
  );
}
