"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CATEGORIES, PRODUCTS, discountPct, type CategorySlug, type Product } from "../_lib/catalog";
import { SEARCH_SUGGESTIONS, searchCatalog } from "../_lib/search";
import { ProductCard, ProductCardSkeleton } from "./product-card";
import { searchHref } from "./search-box";

const PAGE_SIZE = 12;

const PRICE_BUCKETS = [
  { id: "ate-100", label: "Até R$ 100", test: (p: number) => p <= 100 },
  { id: "100-500", label: "R$ 100 a R$ 500", test: (p: number) => p > 100 && p <= 500 },
  { id: "500-1500", label: "R$ 500 a R$ 1.500", test: (p: number) => p > 500 && p <= 1500 },
  { id: "acima-1500", label: "Acima de R$ 1.500", test: (p: number) => p > 1500 },
] as const;

const SORTS = [
  { id: "relevancia", label: "Mais relevantes" },
  { id: "menor-preco", label: "Menor preço" },
  { id: "maior-preco", label: "Maior preço" },
  { id: "desconto", label: "Maior desconto" },
  { id: "nome", label: "Nome (A–Z)" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

export type ListingMode =
  | { kind: "all" }
  | { kind: "offers" }
  | { kind: "category"; category: CategorySlug }
  | { kind: "search" };

function list(value: string | null) {
  return value ? value.split(",").filter(Boolean) : [];
}

function sortProducts(products: Product[], sort: SortId) {
  const copy = [...products];
  switch (sort) {
    case "menor-preco":
      return copy.sort((a, b) => a.price - b.price);
    case "maior-preco":
      return copy.sort((a, b) => b.price - a.price);
    case "desconto":
      return copy.sort((a, b) => discountPct(b) - discountPct(a));
    case "nome":
      return copy.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    default:
      return copy;
  }
}

type FilterState = { cats: string[]; prices: string[]; offer: boolean; free: boolean };
type Facet = "cat" | "preco" | "oferta" | "frete";

function matches(p: Product, state: FilterState, skip?: Facet) {
  return (
    (skip === "cat" || state.cats.length === 0 || state.cats.includes(p.category)) &&
    (skip === "preco" ||
      state.prices.length === 0 ||
      PRICE_BUCKETS.some((b) => state.prices.includes(b.id) && b.test(p.price))) &&
    (skip === "oferta" || !state.offer || discountPct(p) > 0) &&
    (skip === "frete" || !state.free || p.freeShipping)
  );
}

function FacetOption({
  checked,
  disabled,
  onChange,
  label,
  count,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
  count: number;
}) {
  // An already-checked option stays enabled so it can always be unticked.
  const off = disabled && !checked;
  return (
    <label className={`lj-check ${off ? "cursor-not-allowed opacity-50" : ""}`}>
      <input type="checkbox" checked={checked} disabled={off} onChange={onChange} />
      <span className="flex-1">{label}</span>
      <span className="lj-tiny lj-muted">{count}</span>
    </label>
  );
}

/*
 * Facet counts are computed against the products that pass every OTHER
 * active facet, so a number next to an option is always what the shopper
 * gets by ticking it (no dead-end "0 resultados" surprises). Options that
 * exist in the catalog but would return nothing stay visible, disabled.
 */
function FilterPanel({
  base,
  state,
  showCategories,
  toggle,
}: {
  base: Product[];
  state: FilterState;
  showCategories: boolean;
  toggle: (key: Facet, value?: string) => void;
}) {
  const pool = (skip: Facet) => base.filter((p) => matches(p, state, skip));
  const catPool = pool("cat");
  const pricePool = pool("preco");
  const categoryOptions = CATEGORIES.filter((c) => base.some((p) => p.category === c.slug)).map((c) => ({
    ...c,
    count: catPool.filter((p) => p.category === c.slug).length,
  }));
  const priceOptions = PRICE_BUCKETS.filter((b) => base.some((p) => b.test(p.price))).map((b) => ({
    ...b,
    count: pricePool.filter((p) => b.test(p.price)).length,
  }));
  const offerCount = pool("oferta").filter((p) => discountPct(p) > 0).length;
  const freeCount = pool("frete").filter((p) => p.freeShipping).length;
  const hasOffers = base.some((p) => discountPct(p) > 0);
  const hasFree = base.some((p) => p.freeShipping);

  return (
    <div className="flex flex-col gap-6">
      {showCategories && categoryOptions.length > 1 && (
        <fieldset>
          <legend className="lj-label mb-2">Categoria</legend>
          {categoryOptions.map((c) => (
            <FacetOption
              key={c.slug}
              label={c.name}
              count={c.count}
              checked={state.cats.includes(c.slug)}
              disabled={c.count === 0}
              onChange={() => toggle("cat", c.slug)}
            />
          ))}
        </fieldset>
      )}
      {priceOptions.length > 1 && (
        <fieldset>
          <legend className="lj-label mb-2">Preço</legend>
          {priceOptions.map((b) => (
            <FacetOption
              key={b.id}
              label={b.label}
              count={b.count}
              checked={state.prices.includes(b.id)}
              disabled={b.count === 0}
              onChange={() => toggle("preco", b.id)}
            />
          ))}
        </fieldset>
      )}
      {(hasOffers || hasFree) && (
        <fieldset>
          <legend className="lj-label mb-2">Condições</legend>
          {hasOffers && (
            <FacetOption label="Com desconto" count={offerCount} checked={state.offer} disabled={offerCount === 0} onChange={() => toggle("oferta")} />
          )}
          {hasFree && (
            <FacetOption label="Frete grátis" count={freeCount} checked={state.free} disabled={freeCount === 0} onChange={() => toggle("frete")} />
          )}
        </fieldset>
      )}
    </div>
  );
}

export function ProductListing({ mode }: { mode: ListingMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const query = mode.kind === "search" ? (params.get("q") ?? "").trim() : "";
  const search = useMemo(() => (mode.kind === "search" ? searchCatalog(query) : null), [mode.kind, query]);

  const base = useMemo(() => {
    switch (mode.kind) {
      case "category":
        return PRODUCTS.filter((p) => p.category === mode.category);
      case "offers":
        return PRODUCTS.filter((p) => discountPct(p) > 0);
      case "search":
        return search?.products ?? [];
      default:
        return PRODUCTS;
    }
  }, [mode, search]);

  const state: FilterState = {
    cats: list(params.get("cat")),
    prices: list(params.get("preco")),
    offer: params.get("oferta") === "1",
    free: params.get("frete") === "1",
  };
  const sortParam = params.get("ordem");
  const sort: SortId = SORTS.some((s) => s.id === sortParam) ? (sortParam as SortId) : "relevancia";

  const filtered = sortProducts(
    base.filter((p) => matches(p, state)),
    sort,
  );

  function update(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    setVisible(PAGE_SIZE);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function toggle(key: Facet, value?: string) {
    update((next) => {
      if (key === "oferta" || key === "frete") {
        if (next.get(key) === "1") next.delete(key);
        else next.set(key, "1");
        return;
      }
      const current = list(next.get(key));
      const updated = current.includes(value!) ? current.filter((v) => v !== value) : [...current, value!];
      if (updated.length) next.set(key, updated.join(","));
      else next.delete(key);
    });
  }

  function clearFilters() {
    update((next) => {
      ["cat", "preco", "oferta", "frete"].forEach((k) => next.delete(k));
    });
  }

  const chips = [
    ...state.cats.map((c) => ({ key: `cat-${c}`, label: CATEGORIES.find((x) => x.slug === c)?.shortName ?? c, onRemove: () => toggle("cat", c) })),
    ...state.prices.map((id) => ({ key: `p-${id}`, label: PRICE_BUCKETS.find((b) => b.id === id)?.label ?? id, onRemove: () => toggle("preco", id) })),
    ...(state.offer ? [{ key: "oferta", label: "Com desconto", onRemove: () => toggle("oferta") }] : []),
    ...(state.free ? [{ key: "frete", label: "Frete grátis", onRemove: () => toggle("frete") }] : []),
  ];

  const showCategories = mode.kind !== "category";
  const panel = <FilterPanel base={base} state={state} showCategories={showCategories} toggle={toggle} />;
  const hasFilterOptions = base.length > 1;

  if (mode.kind === "search" && base.length === 0) {
    return <SearchEmpty query={query} />;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
      {hasFilterOptions && (
        <aside aria-label="Filtros" className="hidden lg:block">
          <div className="sticky top-[calc(var(--lj-header-h)+72px)] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="lj-h3">Filtrar</h2>
              {chips.length > 0 && (
                <button type="button" className="lj-link text-sm" onClick={clearFilters}>
                  Limpar
                </button>
              )}
            </div>
            {panel}
          </div>
        </aside>
      )}

      <div className={`min-w-0 ${hasFilterOptions ? "" : "lg:col-span-2"}`}>
        {search?.correctedQuery && (
          <p className="lj-alert lj-alert--info mb-4" role="status">
            Não encontramos “{query}”. Mostrando resultados para <strong>“{search.correctedQuery}”</strong>.
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="lj-small lj-muted" aria-live="polite">
            <strong className="text-[color:var(--lj-ink)]">{filtered.length}</strong>{" "}
            {filtered.length === 1 ? "produto encontrado" : "produtos encontrados"}
            {mode.kind === "search" && query && !search?.correctedQuery && (
              <>
                {" "}para <strong className="text-[color:var(--lj-ink)]">“{query}”</strong>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            {hasFilterOptions && (
              <button type="button" className="lj-btn lj-btn--secondary lj-btn--sm lg:hidden" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal aria-hidden="true" /> Filtrar{chips.length ? ` (${chips.length})` : ""}
              </button>
            )}
            <label className="lj-sr-only" htmlFor="lj-sort">
              Ordenar por
            </label>
            <select
              id="lj-sort"
              className="lj-select min-h-9 w-auto py-0 pr-8 text-sm"
              value={sort}
              onChange={(e) =>
                update((next) => {
                  if (e.target.value === "relevancia") next.delete("ordem");
                  else next.set("ordem", e.target.value);
                })
              }
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="mb-5 flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button type="button" className="lj-chip lj-chip--active" onClick={chip.onRemove} aria-label={`Remover filtro ${chip.label}`}>
                  {chip.label} <X aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="lj-link px-2 text-sm" onClick={clearFilters}>
                Limpar filtros
              </button>
            </li>
          </ul>
        )}

        {filtered.length === 0 ? (
          <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-12 text-center" role="status">
            <SearchX className="size-8 text-[color:var(--lj-muted)]" aria-hidden="true" />
            <p className="lj-h3">Nenhum produto com esses filtros</p>
            <p className="lj-small lj-muted">Remova algum filtro para ver mais opções.</p>
            <button type="button" className="lj-btn lj-btn--primary" onClick={clearFilters}>
              Limpar filtros
            </button>
          </div>
        ) : (
          <>
            <ul className="lj-grid-products">
              {filtered.slice(0, visible).map((p, i) => (
                <li key={p.slug}>
                  <ProductCard product={p} priority={i < 2} headingLevel="h2" />
                </li>
              ))}
            </ul>
            {filtered.length > visible && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <p className="lj-tiny lj-muted">
                  Mostrando {visible} de {filtered.length}
                </p>
                <button type="button" className="lj-btn lj-btn--secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Carregar mais produtos
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="lj-scope lj-sheet max-h-[85vh] gap-0 rounded-t-[var(--lj-r-xl)] p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--lj-line)] px-4 py-3">
            <SheetTitle className="lj-display text-base font-extrabold text-[color:var(--lj-ink)]">Filtrar produtos</SheetTitle>
            <SheetClose className="lj-header-icon" aria-label="Fechar filtros">
              <X aria-hidden="true" />
            </SheetClose>
          </div>
          <SheetDescription className="lj-sr-only">Os resultados são atualizados a cada seleção.</SheetDescription>
          <div className="overflow-y-auto px-4 py-4">{panel}</div>
          <div className="grid grid-cols-2 gap-2 border-t border-[color:var(--lj-line)] p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <button type="button" className="lj-btn lj-btn--secondary" onClick={clearFilters} disabled={chips.length === 0}>
              Limpar
            </button>
            <button type="button" className="lj-btn lj-btn--primary" onClick={() => setFiltersOpen(false)}>
              Ver {filtered.length} {filtered.length === 1 ? "produto" : "produtos"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SearchEmpty({ query }: { query: string }) {
  return (
    <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-12 text-center" role="status">
      <SearchX className="size-9 text-[color:var(--lj-muted)]" aria-hidden="true" />
      <p className="lj-h3">{query ? `Nenhum resultado para “${query}”` : "Digite um termo para buscar"}</p>
      <p className="lj-small lj-muted max-w-md">
        Confira a grafia ou busque pelo nome do produto, princípio ativo ou acessório.
      </p>
      <ul className="mt-1 flex flex-wrap justify-center gap-2">
        {SEARCH_SUGGESTIONS.map((term) => (
          <li key={term}>
            <Link href={searchHref(term)} className="lj-chip">
              {term}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/loja/produtos" className="lj-btn lj-btn--primary mt-3">
        Ver todos os produtos
      </Link>
    </div>
  );
}

export function ListingSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10" aria-busy="true" aria-label="Carregando produtos">
      <div className="hidden flex-col gap-3 lg:flex">
        <div className="lj-skeleton h-5 w-24" />
        <div className="lj-skeleton h-4 w-40" />
        <div className="lj-skeleton h-4 w-36" />
        <div className="lj-skeleton h-4 w-32" />
      </div>
      <div>
        <div className="lj-skeleton mb-4 h-9 w-full max-w-sm" />
        <div className="lj-grid-products">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
