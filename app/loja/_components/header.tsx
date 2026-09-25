"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu, Popover } from "radix-ui";
import {
  ArrowLeft,
  BadgePercent,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Lock,
  MapPin,
  Menu,
  ShieldCheck,
  ShoppingCart,
  User,
  X,
} from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  CATEGORIES,
  purchasableOffers,
  categoryHref,
  formatBRL,
  productHref,
  productsInCategory,
  type CategorySlug,
} from "../_lib/catalog";
import { formatCep, useCart, useDeliveryLocation, useFavorites } from "../_lib/store";
import { AnnouncementBar } from "./announcement-bar";
import { CartDrawer } from "./cart-drawer";
import { CepLookup } from "./delivery";
import { SearchBox } from "./search-box";
import { ProductImage } from "./ui";


function CepButton() {
  const location = useDeliveryLocation();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="lj-header-icon max-w-[230px]">
        <MapPin aria-hidden="true" />
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <span className="lj-tiny lj-muted font-medium">{location ? "Entregar em" : "Calcule o prazo"}</span>
          <span className="max-w-[170px] truncate">
            {location ? (location.city ? `${location.city}/${location.uf}` : formatCep(location.cep)) : "Informe seu CEP"}
          </span>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="lj-scope lj-card z-[var(--lj-z-popover)] w-[320px] p-4 shadow-[var(--lj-shadow-lg)]"
          aria-label="CEP de entrega"
        >
          <CepLookup autoFocus onSaved={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/*
 * Desktop mega menu (Radix NavigationMenu: hover + keyboard, Esc closes and
 * returns focus to the trigger, arrow keys move between items). The
 * catalog is small, so each category column lists its actual products —
 * one click from the menu to any PDP, with no wall of empty sub-links.
 */
// Offers link only exists while there's a discounted product that can be
// bought online (computed per render — the catalog comes from the database).
function MegaMenu({ pathname }: { pathname: string }) {
  const OFFER_COUNT = purchasableOffers().length;
  return (
    <NavigationMenu.Root className="lj-catnav relative hidden border-t border-[color:var(--lj-line)] lg:block" aria-label="Categorias">
      <NavigationMenu.List className="lj-container flex items-center gap-7">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className="lj-megatrigger group">
            Categorias
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="lj-megamenu">
            <div className="lj-container grid grid-cols-[repeat(3,minmax(0,1fr))_240px] gap-6 py-6">
              {CATEGORIES.map((c) => {
                const products = productsInCategory(c.slug);
                return (
                  <div key={c.slug} className="flex min-w-0 flex-col gap-3">
                    <NavigationMenu.Link asChild>
                      <Link href={categoryHref(c.slug)} className="group/cat flex flex-col gap-0.5 rounded-[var(--lj-r-md)] p-2 hover:bg-[color:var(--lj-soft)]">
                        <span className="flex items-center justify-between gap-2 font-bold text-[color:var(--lj-ink)]">
                          {c.name}
                          <span className="lj-badge lj-badge--neutral">{products.length}</span>
                        </span>
                        <span className="lj-tiny lj-muted">{c.description}</span>
                      </Link>
                    </NavigationMenu.Link>
                    <ul className="flex flex-col gap-1">
                      {products.map((p) => (
                        <li key={p.slug}>
                          <NavigationMenu.Link asChild>
                            <Link href={productHref(p.slug)} className="flex items-center gap-3 rounded-[var(--lj-r-md)] p-2 hover:bg-[color:var(--lj-soft)]">
                              <span className="lj-media size-11 shrink-0 rounded-[var(--lj-r-sm)] p-1">
                                <ProductImage image={p.image} sizes="44px" decorative />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 text-sm font-semibold leading-snug text-[color:var(--lj-ink)]">{p.name}</span>
                                <span className="lj-tiny block">
                                  <strong className="text-[color:var(--lj-ink)]">{formatBRL(p.price)}</strong>
                                  <span className="lj-muted"> · {p.presentation}</span>
                                </span>
                              </span>
                            </Link>
                          </NavigationMenu.Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <div className="flex flex-col gap-3">
                {OFFER_COUNT > 0 && (
                  <NavigationMenu.Link asChild>
                    <Link href="/loja/ofertas" className="lj-panel flex flex-col gap-1 p-4 hover:bg-[color:var(--lj-primary-soft)]">
                      <BadgePercent className="size-5 text-[color:var(--lj-deal)]" aria-hidden="true" />
                      <span className="font-bold text-[color:var(--lj-ink)]">Ofertas</span>
                      <span className="lj-tiny lj-muted">
                        {OFFER_COUNT} {OFFER_COUNT === 1 ? "produto" : "produtos"} com preço abaixo do anterior
                      </span>
                    </Link>
                  </NavigationMenu.Link>
                )}
                <NavigationMenu.Link asChild>
                  <Link href="/" className="lj-panel flex flex-col gap-1 p-4 hover:bg-[color:var(--lj-primary-soft)]">
                    <ShieldCheck className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" />
                    <span className="font-bold text-[color:var(--lj-ink)]">Verificar autenticidade</span>
                    <span className="lj-tiny lj-muted">Confira a origem do seu produto pelo serial ou QR Code.</span>
                  </Link>
                </NavigationMenu.Link>
              </div>
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        {[
          ...(OFFER_COUNT ? [{ href: "/loja/ofertas", label: "Ofertas" }] : []),
          { href: "/loja/produtos", label: "Todos os produtos" },
          ...CATEGORIES.map((c) => ({ href: categoryHref(c.slug), label: c.shortName })),
        ].map((item) => (
          <NavigationMenu.Item key={item.href}>
            <NavigationMenu.Link asChild active={pathname === item.href}>
              <Link href={item.href} className="lj-catnav-link" aria-current={pathname === item.href ? "page" : undefined}>
                {item.label}
              </Link>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        ))}
        <NavigationMenu.Item className="ml-auto">
          <NavigationMenu.Link asChild>
            <Link href="/loja/ajuda" className="lj-catnav-link">
              Central de ajuda
            </Link>
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}

const menuRow =
  "flex min-h-12 w-full items-center gap-3 rounded-[var(--lj-r-md)] px-3 text-left text-[15px] font-semibold text-[color:var(--lj-ink)] hover:bg-[color:var(--lj-soft)]";

/*
 * Mobile menu: progressive drill-down (root → category → its products)
 * instead of a shrunken desktop mega menu. Focus moves to the new level's
 * back button, and back to the category that was opened on return.
 */
function MobileMenu({ open, onOpenChange, pathname }: { open: boolean; onOpenChange: (v: boolean) => void; pathname: string }) {
  const favorites = useFavorites();
  const [panel, setPanel] = useState<CategorySlug | null>(null);
  const focusBack = useRef(false);
  const returnTo = useRef<CategorySlug | null>(null);
  const close = () => onOpenChange(false);
  const category = panel ? CATEGORIES.find((c) => c.slug === panel) : undefined;
  const OFFER_COUNT = purchasableOffers().length;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setPanel(null);
      }}
    >
      <SheetContent side="left" showCloseButton={false} className="lj-scope lj-sheet w-[88vw] max-w-[360px] gap-0 p-0">
        <div className="flex items-center justify-between border-b border-[color:var(--lj-line)] px-4 py-3">
          <SheetTitle className="lj-display text-base font-extrabold text-[color:var(--lj-ink)]">
            {category ? category.name : "Menu"}
          </SheetTitle>
          <SheetClose className="lj-header-icon" aria-label="Fechar menu">
            <X aria-hidden="true" />
          </SheetClose>
        </div>
        <SheetDescription className="lj-sr-only">Categorias, produtos, sua conta e CEP de entrega</SheetDescription>

        {category ? (
          <nav aria-label={category.name} className="flex-1 overflow-y-auto px-2 py-3">
            <button
              ref={(el) => {
                if (el && focusBack.current) {
                  focusBack.current = false;
                  el.focus();
                }
              }}
              type="button"
              className={`${menuRow} text-[color:var(--lj-primary)]`}
              onClick={() => {
                returnTo.current = category.slug;
                setPanel(null);
              }}
            >
              <ChevronLeft className="size-5" aria-hidden="true" /> Voltar
            </button>
            <Link href={categoryHref(category.slug)} className={menuRow} onClick={close}>
              Ver todos em {category.shortName}
              <span className="lj-badge lj-badge--neutral ml-auto">{productsInCategory(category.slug).length}</span>
            </Link>
            <ul className="mt-1 flex flex-col gap-1">
              {productsInCategory(category.slug).map((p) => (
                <li key={p.slug}>
                  <Link href={productHref(p.slug)} className={`${menuRow} min-h-16 py-2`} onClick={close}>
                    <span className="lj-media size-12 shrink-0 rounded-[var(--lj-r-sm)] p-1">
                      <ProductImage image={p.image} sizes="48px" decorative />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <span className="lj-tiny lj-muted block truncate font-normal">{p.presentation}</span>
                    </span>
                    <span className="text-sm">{formatBRL(p.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <nav aria-label="Menu da loja" className="flex-1 overflow-y-auto px-2 py-3">
            <p className="lj-search-group">Categorias</p>
            <ul>
              {CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <button
                    ref={(el) => {
                      if (el && returnTo.current === c.slug) {
                        returnTo.current = null;
                        el.focus();
                      }
                    }}
                    type="button"
                    className={menuRow}
                    onClick={() => {
                      focusBack.current = true;
                      setPanel(c.slug);
                    }}
                    aria-label={`${c.name}: ver produtos`}
                  >
                    {c.name}
                    <span className="lj-tiny lj-muted ml-auto font-medium">{productsInCategory(c.slug).length}</span>
                    <ChevronRight className="size-5 text-[color:var(--lj-muted)]" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {OFFER_COUNT > 0 && (
                <li>
                  <Link href="/loja/ofertas" className={menuRow} onClick={close} aria-current={pathname === "/loja/ofertas" ? "page" : undefined}>
                    <BadgePercent className="size-5 text-[color:var(--lj-deal)]" aria-hidden="true" /> Ofertas
                  </Link>
                </li>
              )}
              <li>
                <Link href="/loja/produtos" className={menuRow} onClick={close}>
                  Todos os produtos
                </Link>
              </li>
            </ul>
            <p className="lj-search-group mt-3">Sua conta</p>
            <ul>
              <li>
                <Link href="/loja/conta" className={menuRow} onClick={close}>
                  <User className="size-5" aria-hidden="true" /> Minha conta
                </Link>
              </li>
              <li>
                <Link href="/loja/favoritos" className={menuRow} onClick={close}>
                  <Heart className="size-5" aria-hidden="true" /> Favoritos
                  {favorites.length > 0 && <span className="lj-badge lj-badge--info ml-auto">{favorites.length}</span>}
                </Link>
              </li>
              <li>
                <Link href="/" className={menuRow} onClick={close}>
                  <ShieldCheck className="size-5" aria-hidden="true" /> Verificar autenticidade
                </Link>
              </li>
              <li>
                <Link href="/loja/ajuda" className={menuRow} onClick={close}>
                  Central de ajuda
                </Link>
              </li>
            </ul>
            <div className="lj-panel mx-1 mt-4 p-4">
              <CepLookup />
            </div>
          </nav>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function StoreHeader() {
  const pathname = usePathname();
  const { count } = useCart();
  const favorites = useFavorites();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Publish the sticky header's real height as a CSS variable, so other
  // sticky/fixed elements (filters bar, mobile search, sidebars) sit
  // exactly below it at every breakpoint.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--lj-header-real", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    // "/" jumps to the search box (like most stores/docs sites), unless typing.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const input = [...document.querySelectorAll<HTMLInputElement>(".lj-search-input")].find((el) => el.offsetParent !== null);
      if (input) {
        e.preventDefault();
        input.focus();
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

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

  // The top info bar sits OUTSIDE the sticky header, so it simply scrolls
  // away and the sticky part stays compact — no height change while
  // scrolling (which would shift content).
  return (
    <>
      <AnnouncementBar />
    <header ref={headerRef} className="lj-header" data-scrolled={scrolled ? "" : undefined}>
      <div className="lj-container flex items-center gap-2 py-2.5 md:gap-4 md:py-3">
        <button type="button" className="lj-header-icon -ml-2 lg:hidden" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>
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
          <Link href="/loja/conta" className="lj-header-icon hidden sm:inline-flex" aria-label="Minha conta">
            <User aria-hidden="true" />
          </Link>
          <Link
            href="/loja/favoritos"
            className="lj-header-icon hidden sm:inline-flex"
            aria-label={`Favoritos${favorites.length ? ` (${favorites.length})` : ""}`}
          >
            <Heart aria-hidden="true" />
            {favorites.length > 0 && <span className="lj-count">{favorites.length}</span>}
          </Link>
          <button
            type="button"
            className="lj-header-icon"
            aria-haspopup="dialog"
            aria-label={`Carrinho${count ? `, ${count} ${count === 1 ? "item" : "itens"}` : ", vazio"}`}
            onClick={() => setCartOpen(true)}
          >
            <ShoppingCart aria-hidden="true" />
            <span className="hidden lg:inline">Carrinho</span>
            {count > 0 && <span className="lj-count">{count}</span>}
          </button>
        </div>
      </div>

      <div className="lj-container pb-2.5 md:hidden">
        <SearchBox />
      </div>

      <MegaMenu pathname={pathname} />
      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} pathname={pathname} />
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </header>
    </>
  );
}
