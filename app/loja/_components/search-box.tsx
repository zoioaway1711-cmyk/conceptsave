"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock, LayoutGrid, Search, SearchX, X } from "lucide-react";
import { categoryHref, formatBRL, productHref } from "../_lib/catalog";
import { SEARCH_SUGGESTIONS, searchCatalog } from "../_lib/search";
import { clearRecentSearches, rememberSearch, useRecentSearches } from "../_lib/store";
import { ProductImage } from "./ui";

type Option = { id: string; kind: "link"; href: string; term?: string } | { id: string; kind: "term"; term: string };

export function searchHref(term: string) {
  return `/loja/busca?q=${encodeURIComponent(term.trim())}`;
}

/*
 * WAI-ARIA combobox: the input owns a listbox of options that arrow keys
 * move through (aria-activedescendant), Enter follows the active option or
 * submits the typed text, Escape closes. Results are computed locally from
 * the catalog on every keystroke — there is no network round-trip, so
 * there is no loading or network-error state to show here.
 */
export function SearchBox({ autoFocus, onNavigate }: { autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const recent = useRecentSearches();

  const result = useMemo(() => searchCatalog(value), [value]);
  const hasQuery = result.query.length > 0;
  const products = result.products.slice(0, 5);

  const options: Option[] = useMemo(() => {
    if (!hasQuery) {
      return [
        ...recent.map((term, i) => ({ id: `${baseId}-r${i}`, kind: "term" as const, term })),
        ...SEARCH_SUGGESTIONS.map((term, i) => ({ id: `${baseId}-s${i}`, kind: "term" as const, term })),
      ];
    }
    const list: Option[] = [
      ...result.categories.map((c) => ({ id: `${baseId}-c${c.slug}`, kind: "link" as const, href: categoryHref(c.slug) })),
      ...products.map((p) => ({ id: `${baseId}-p${p.slug}`, kind: "link" as const, href: productHref(p.slug), term: value })),
    ];
    if (result.products.length > 0) list.push({ id: `${baseId}-all`, kind: "term", term: value.trim() });
    return list;
  }, [hasQuery, recent, result, products, value, baseId]);

  function go(term: string) {
    const clean = term.trim();
    if (!clean) return;
    rememberSearch(clean);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    onNavigate?.();
    router.push(searchHref(clean));
  }

  function follow(option: Option) {
    if (option.kind === "term") {
      go(option.term);
      return;
    }
    if (option.term) rememberSearch(option.term);
    setOpen(false);
    onNavigate?.();
    router.push(option.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (options.length ? (i + 1) % options.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1));
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      follow(options[active]);
    }
  }

  const optionProps = (index: number) => ({
    id: options[index]?.id,
    role: "option" as const,
    "aria-selected": active === index,
    "data-index": index,
    onMouseEnter: () => setActive(index),
    className: "lj-search-option",
  });

  let cursor = 0;
  const next = () => cursor++;

  return (
    <div
      className="lj-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <form
        role="search"
        action="/loja/busca"
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
      >
        <label htmlFor={`${baseId}-input`} className="lj-sr-only">
          Buscar produtos
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[color:var(--lj-muted)]" aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          name="q"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          autoFocus={autoFocus}
          placeholder="Busque por produto, princípio ativo ou acessório"
          aria-keyshortcuts="/"
          className="lj-search-input"
          value={value}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? options[active]?.id : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {value ? (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-[var(--lj-r-sm)] text-[color:var(--lj-muted)] hover:bg-[color:var(--lj-soft)]"
            aria-label="Limpar busca"
            onClick={() => {
              setValue("");
              setActive(-1);
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </form>

      {open && (
        <div className="lj-search-panel">
          <div
            id={listId}
            role="listbox"
            aria-label="Sugestões de busca"
            // Keep focus in the input so the panel doesn't close before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              const el = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
              const option = el ? options[Number(el.dataset.index)] : undefined;
              if (option) follow(option);
            }}
          >
            {!hasQuery && (
              <>
                {recent.length > 0 && (
                  <div role="group" aria-label="Buscas recentes">
                    <div className="lj-search-group flex items-center justify-between">
                      <span>Buscas recentes</span>
                      <button
                        type="button"
                        className="lj-link normal-case tracking-normal"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => clearRecentSearches()}
                      >
                        Limpar
                      </button>
                    </div>
                    {recent.map((term) => (
                      <div key={term} {...optionProps(next())}>
                        <Clock className="size-4 text-[color:var(--lj-muted)]" aria-hidden="true" />
                        <span className="flex-1 truncate">{term}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div role="group" aria-label="Sugestões">
                  <div className="lj-search-group">Sugestões do catálogo</div>
                  {SEARCH_SUGGESTIONS.map((term) => (
                    <div key={term} {...optionProps(next())}>
                      <Search className="size-4 text-[color:var(--lj-muted)]" aria-hidden="true" />
                      <span className="flex-1">{term}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {hasQuery && result.categories.length > 0 && (
              <div role="group" aria-label="Categorias">
                <div className="lj-search-group">Categorias</div>
                {result.categories.map((c) => (
                  <div key={c.slug} {...optionProps(next())}>
                    <LayoutGrid className="size-4 text-[color:var(--lj-muted)]" aria-hidden="true" />
                    <span className="flex-1">{c.name}</span>
                  </div>
                ))}
              </div>
            )}

            {hasQuery && products.length > 0 && (
              <div role="group" aria-label="Produtos">
                <div className="lj-search-group">
                  {result.correctedQuery ? `Mostrando resultados para “${result.correctedQuery}”` : "Produtos"}
                </div>
                {products.map((p) => (
                  <div key={p.slug} {...optionProps(next())}>
                    <span className="lj-media size-11 shrink-0 rounded-[var(--lj-r-sm)] p-1">
                      <ProductImage image={p.image} sizes="44px" decorative />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="lj-tiny lj-muted block truncate">{p.presentation}</span>
                    </span>
                    <span className="text-sm font-bold">{formatBRL(p.price)}</span>
                  </div>
                ))}
                <div {...optionProps(next())}>
                  <ArrowUpRight className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" />
                  <span className="flex-1 font-semibold text-[color:var(--lj-primary)]">
                    Ver todos os resultados para “{value.trim()}”
                  </span>
                </div>
              </div>
            )}
          </div>

          {hasQuery && products.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center" role="status">
              <SearchX className="size-7 text-[color:var(--lj-muted)]" aria-hidden="true" />
              <p className="text-sm font-semibold text-[color:var(--lj-ink)]">Nenhum produto para “{value.trim()}”</p>
              <p className="lj-tiny lj-muted">Confira a grafia ou tente um destes termos:</p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {SEARCH_SUGGESTIONS.slice(0, 3).map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="lj-chip"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
              <Link href="/loja/produtos" className="lj-link mt-2 text-sm" onClick={() => setOpen(false)}>
                Ver todos os produtos
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
