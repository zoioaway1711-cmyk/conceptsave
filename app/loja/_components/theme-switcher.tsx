"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

/*
 * Store theme: follows the OS unless the shopper picks one. The choice is
 * applied as <html data-lj-theme>, which only .lj-scope styles read, so
 * the verification portal/admin themes are unaffected.
 */

type Theme = "system" | "light" | "dark";
const KEY = "sc-loja-theme";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

// Same values as the layout's `viewport.themeColor`.
const THEME_COLOR: Record<Exclude<Theme, "system">, string> = { light: "#ffffff", dark: "#0b1220" };

function apply(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-lj-theme");
  else document.documentElement.setAttribute("data-lj-theme", theme);
  // Keep the mobile browser bar in step with a manual choice (the meta
  // tags otherwise follow only the OS setting).
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset.ljOriginal ??= meta.content;
    meta.content = theme === "system" ? meta.dataset.ljOriginal : THEME_COLOR[theme];
  }
}

function setTheme(theme: Theme) {
  try {
    if (theme === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: applies to this page view only
  }
  apply(theme);
  listeners.forEach((l) => l());
}

function useTheme() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "system" as Theme,
  );
}

/** Mounted once in the layout: re-applies the saved choice on each visit. */
export function ThemeSync() {
  useEffect(() => {
    apply(read());
  }, []);
  return null;
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Automático", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

/*
 * WAI-ARIA radio group: one tab stop (the checked option), arrow keys move
 * and select, Home/End jump to the ends — same as native radio buttons.
 */
export function ThemeSwitcher() {
  const theme = useTheme();
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = OPTIONS.findIndex((o) => o.value === theme);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % OPTIONS.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i - 1 + OPTIONS.length) % OPTIONS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? OPTIONS.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setTheme(OPTIONS[next].value);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }
  return (
    <div
      role="radiogroup"
      aria-label="Tema da loja"
      onKeyDown={onKeyDown}
      className="inline-flex rounded-[var(--lj-r-md)] border border-[color:var(--lj-line)] bg-[color:var(--lj-soft)] p-0.5"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          tabIndex={theme === o.value ? 0 : -1}
          onClick={() => setTheme(o.value)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--lj-r-sm)] px-3 text-xs font-semibold transition-colors ${
            theme === o.value ? "bg-[color:var(--lj-surface)] text-[color:var(--lj-ink)] shadow-[var(--lj-shadow-sm)]" : "text-[color:var(--lj-muted)] hover:text-[color:var(--lj-ink)]"
          }`}
        >
          <o.icon className="size-3.5" aria-hidden="true" /> {o.label}
        </button>
      ))}
    </div>
  );
}
