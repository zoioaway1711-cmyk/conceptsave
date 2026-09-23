"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Heart, Lock, MapPin, Menu, ShieldCheck, ShoppingCart, Truck, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CATEGORIES, STORE, categoryHref } from "../_lib/catalog";
import { formatCep, useCart, useCep, useFavorites } from "../_lib/store";
import { CepForm } from "./delivery";
import { SearchBox } from "./search-box";

const NAV = [
  ...CATEGORIES.map((c) => ({ href: categoryHref(c.slug), label: c.shortName })),
  { href: "/loja/ofertas", label: "Ofertas" },
  { href: "/loja/produtos", label: "Todos os produtos" },
];

function CepButton() {
  const cep = useCep();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="lj-header-icon max-w-[220px]"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <MapPin aria-hidden="true" />
        <span className="flex flex-col items-start leading-tight">
          <span className="lj-tiny lj-muted font-medium">{cep ? "Entregar em" : "Calcule o prazo"}</span>
          <span className="truncate">{cep ? formatCep(cep) : "Informe seu CEP"}</span>
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Informar CEP de entrega"
          tabIndex={-1}
          className="lj-card absolute left-0 top-[calc(100%+8px)] z-50 w-[320px] p-4"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <CepForm autoFocus onSaved={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function StoreHeader() {
  const pathname = usePathname();
  const { count } = useCart();
  const favorites = useFavorites();
  const [menuOpen, setMenuOpen] = useState(false);

  // Checkout gets a distraction-free header: no search, no category nav.
  if (pathname === "/loja/checkout") {
    return (
      <header className="lj-header">
        <div className="lj-container flex h-16 items-center justify-between gap-3">
          <Link href="/loja/carrinho" className="lj-header-icon -ml-2">
            <ArrowLeft aria-hidden="true" /> <span className="hidden sm:inline">Carrinho</span>
          </Link>
          <Link href="/loja" className="flex items-center gap-2" aria-label="Save Concept Loja — página inicial">
            <Image src="/save-concept-mark-v2.png" alt="" width={30} height={30} priority />
            <span className="lj-display text-base font-extrabold">Save Concept</span>
          </Link>
          <span className="lj-tiny inline-flex items-center gap-1.5 font-semibold text-[color:var(--lj-success)]">
            <Lock className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Compra segura</span>
          </span>
        </div>
      </header>
    );
  }

  return (
    <header className="lj-header">
      <div className="lj-topbar hidden sm:block">
        <div className="lj-container flex h-9 items-center justify-between gap-4">
          <p className="inline-flex items-center gap-2">
            <Truck className="size-3.5" aria-hidden="true" /> Frete grátis nos frascos e kits · entrega refrigerada em {STORE.delivery.window}
          </p>
          <Link href="/" className="inline-flex items-center gap-1.5 font-semibold text-white hover:underline">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Verificar autenticidade do produto
          </Link>
        </div>
      </div>

      <div className="lj-container flex items-center gap-2 py-2.5 md:gap-4 md:py-3">
        <button
          type="button"
          className="lj-header-icon -ml-2 lg:hidden"
          aria-label="Abrir menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>

        <Link href="/loja" className="flex shrink-0 items-center gap-2" aria-label="Save Concept Loja — página inicial">
          <Image src="/save-concept-mark-v2.png" alt="" width={34} height={34} priority />
          <span className="lj-display hidden text-[17px] font-extrabold leading-none min-[380px]:inline">
            Save Concept
            <span className="lj-tiny lj-muted block font-semibold tracking-normal">Loja oficial</span>
          </span>
        </Link>

        <div className="hidden flex-1 md:block md:max-w-[620px] lg:ml-4">
          <SearchBox />
        </div>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <div className="hidden lg:block">
            <CepButton />
          </div>
          <Link
            href="/loja/favoritos"
            className="lj-header-icon hidden sm:inline-flex"
            aria-label={`Favoritos${favorites.length ? ` (${favorites.length})` : ""}`}
          >
            <Heart aria-hidden="true" />
            {favorites.length > 0 && <span className="lj-count">{favorites.length}</span>}
          </Link>
          <Link
            href="/"
            className="lj-header-icon hidden xl:inline-flex"
            aria-label="Verificar autenticidade do produto"
          >
            <ShieldCheck aria-hidden="true" />
            <span>Verificar produto</span>
          </Link>
          <Link
            href="/loja/carrinho"
            className="lj-header-icon"
            aria-label={`Carrinho${count ? `, ${count} ${count === 1 ? "item" : "itens"}` : ", vazio"}`}
          >
            <ShoppingCart aria-hidden="true" />
            <span className="hidden lg:inline">Carrinho</span>
            {count > 0 && <span className="lj-count">{count}</span>}
          </Link>
        </div>
      </div>

      <div className="lj-container pb-2.5 md:hidden">
        <SearchBox />
      </div>

      <nav aria-label="Categorias" className="lj-catnav hidden border-t border-[color:var(--lj-line)] lg:block">
        <ul className="lj-container flex items-center gap-7">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
          <li className="ml-auto">
            <Link href="/loja#duvidas">Dúvidas frequentes</Link>
          </li>
        </ul>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" showCloseButton={false} className="lj-scope lj-sheet w-[88vw] max-w-[360px] gap-0 p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--lj-line)] px-4 py-3">
            <SheetTitle className="lj-display text-base font-extrabold text-[color:var(--lj-ink)]">Menu</SheetTitle>
            <SheetClose className="lj-header-icon" aria-label="Fechar menu">
              <X aria-hidden="true" />
            </SheetClose>
          </div>
          <SheetDescription className="lj-sr-only">Categorias, favoritos e CEP de entrega</SheetDescription>
          <nav aria-label="Menu da loja" className="flex-1 overflow-y-auto px-2 py-3">
            <p className="lj-search-group">Categorias</p>
            <ul>
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-12 items-center rounded-[var(--lj-r-md)] px-3 text-[15px] font-semibold text-[color:var(--lj-ink)] hover:bg-[color:var(--lj-soft)]"
                    onClick={() => setMenuOpen(false)}
                    aria-current={pathname === item.href ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="lj-search-group mt-3">Sua conta</p>
            <ul>
              <li>
                <Link
                  href="/loja/favoritos"
                  className="flex min-h-12 items-center gap-3 rounded-[var(--lj-r-md)] px-3 text-[15px] font-semibold text-[color:var(--lj-ink)] hover:bg-[color:var(--lj-soft)]"
                  onClick={() => setMenuOpen(false)}
                >
                  <Heart className="size-5" aria-hidden="true" /> Favoritos
                  {favorites.length > 0 && <span className="lj-badge lj-badge--info ml-auto">{favorites.length}</span>}
                </Link>
              </li>
              <li>
                <Link
                  href="/"
                  className="flex min-h-12 items-center gap-3 rounded-[var(--lj-r-md)] px-3 text-[15px] font-semibold text-[color:var(--lj-ink)] hover:bg-[color:var(--lj-soft)]"
                  onClick={() => setMenuOpen(false)}
                >
                  <ShieldCheck className="size-5" aria-hidden="true" /> Verificar autenticidade
                </Link>
              </li>
              <li>
                <Link
                  href="/loja#duvidas"
                  className="flex min-h-12 items-center gap-3 rounded-[var(--lj-r-md)] px-3 text-[15px] font-semibold text-[color:var(--lj-ink)] hover:bg-[color:var(--lj-soft)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Dúvidas frequentes
                </Link>
              </li>
            </ul>
            <div className="lj-panel mx-1 mt-4 p-4">
              <CepForm />
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
