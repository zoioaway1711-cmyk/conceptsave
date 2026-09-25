"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";

/*
 * Page-level polish, mounted once in the layout:
 *  - reveals `.lj-reveal` sections as they enter the viewport (skipped
 *    entirely for prefers-reduced-motion, and if IntersectionObserver
 *    isn't available everything is simply shown);
 *  - "voltar ao topo" after a long scroll.
 */
export function PageEffects() {
  const pathname = usePathname();
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supported = "IntersectionObserver" in window && "MutationObserver" in window;
    const io = supported
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                e.target.classList.add("is-visible");
                io?.unobserve(e.target);
              }
            }
          },
          { rootMargin: "0px 0px -8% 0px" },
        )
      : null;
    // Handles sections present now AND ones streamed in later (e.g. after
    // loading.tsx), so nothing can stay hidden.
    const track = (root: Document) => {
      for (const el of root.querySelectorAll<HTMLElement>(".lj-reveal:not(.is-visible)")) {
        if (reduce || !io || el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-visible");
        else io.observe(el);
      }
    };
    track(document);
    if (!reduce && io) document.documentElement.classList.add("lj-motion");
    const mo = supported
      ? new MutationObserver((records) => {
          if (records.some((r) => r.addedNodes.length)) track(document);
        })
      : null;
    const main = document.getElementById("conteudo");
    if (mo && main) mo.observe(main, { childList: true, subtree: true });
    return () => {
      io?.disconnect();
      mo?.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 1400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!showTop) return null;
  return (
    <button
      type="button"
      className="lj-totop"
      aria-label="Voltar ao topo"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        document.getElementById("conteudo")?.focus({ preventScroll: true });
      }}
    >
      <ArrowUp className="size-5" aria-hidden="true" />
    </button>
  );
}
