import { CATEGORIES, PRODUCTS, type Category, type Product } from "./catalog";

/*
 * Client-side catalog search. The catalog is small and fully known at
 * build time, so matching runs locally (instant, works offline) — the
 * shape of `searchCatalog`'s result is what a future /api search endpoint
 * would need to return, so the UI won't change if this moves server-side.
 */

export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function haystack(p: Product) {
  return normalize([p.name, p.presentation, p.brand, p.summary, ...p.keywords].join(" "));
}

const INDEX = PRODUCTS.map((p) => ({ product: p, text: haystack(p), name: normalize(p.name) }));

const VOCABULARY = Array.from(new Set(INDEX.flatMap((e) => e.text.split(" ")).filter((w) => w.length >= 4)));

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function correctWord(word: string) {
  if (word.length < 4 || VOCABULARY.includes(word)) return word;
  let best = word;
  let bestDistance = Math.max(2, Math.floor(word.length / 4));
  for (const candidate of VOCABULARY) {
    const d = levenshtein(word, candidate);
    if (d < bestDistance || (d === bestDistance && best === word && d <= 2)) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

function match(terms: string[]) {
  return INDEX.map((entry) => {
    let score = 0;
    for (const term of terms) {
      if (!entry.text.includes(term)) return { entry, score: -1 };
      score += entry.name.includes(term) ? 3 : 1;
      if (entry.name.startsWith(term)) score += 2;
    }
    return { entry, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.entry.product);
}

export type SearchResult = {
  query: string;
  products: Product[];
  categories: Category[];
  /** Set when the literal query had no hits and a spelling fix did. */
  correctedQuery?: string;
};

export function searchCatalog(rawQuery: string): SearchResult {
  const query = normalize(rawQuery);
  if (!query) return { query, products: [], categories: [] };
  const terms = query.split(" ");
  const categories = CATEGORIES.filter((c) =>
    terms.some((t) => normalize(`${c.name} ${c.shortName}`).includes(t)),
  );
  let products = match(terms);
  let correctedQuery: string | undefined;
  if (products.length === 0) {
    const fixed = terms.map(correctWord);
    if (fixed.join(" ") !== query) {
      products = match(fixed);
      if (products.length) correctedQuery = fixed.join(" ");
    }
  }
  return { query, products, categories, correctedQuery };
}

/** Real catalog terms offered as starting points — not a popularity ranking. */
export const SEARCH_SUGGESTIONS = ["Tirzepatida", "Retatrutida", "Kit Duo", "Seringas", "Diluente"];
