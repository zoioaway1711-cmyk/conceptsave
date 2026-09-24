import { notFound } from "next/navigation";

// Unmatched /loja/* URLs render the store's own not-found page (with
// search and categories) instead of the site-wide default 404.
export default function LojaCatchAll() {
  notFound();
}
