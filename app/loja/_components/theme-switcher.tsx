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

function apply(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-lj-theme");
  else document.documentElement.setAttribute("data-lj-theme", theme);
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

export function ThemeSwitcher() {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema da loja" className="inline-flex rounded-[var(--lj-r-md)] border border-[color:var(--lj-line)] bg-[color:var(--lj-soft)] p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
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
