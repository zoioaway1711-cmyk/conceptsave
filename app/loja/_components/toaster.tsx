"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { dismissToast, pauseToast, resumeToast, useToasts, type ToastTone } from "../_lib/feedback";

const ICONS: Record<ToastTone, typeof Info> = { success: CheckCircle2, info: Info, error: AlertCircle };

/*
 * Single toast viewport. Two live regions: errors are announced
 * assertively, everything else politely. Hover/focus pauses auto-dismiss.
 * Mobile: top, under the header, so it never covers the sticky buy bar or
 * the added-to-cart panel; desktop: bottom-left, away from both.
 */
export function Toaster() {
  const toasts = useToasts();
  const reduceMotion = useReducedMotion();
  return (
    <div className="lj-toaster" aria-label="Notificações">
      {(["polite", "assertive"] as const).map((politeness) => (
        <div key={politeness} role={politeness === "assertive" ? "alert" : "status"} aria-live={politeness} className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {toasts
              .filter((t) => (t.tone === "error") === (politeness === "assertive"))
              .map((t) => {
                const Icon = ICONS[t.tone];
                return (
                  <motion.div
                    key={t.id}
                    layout={!reduceMotion}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className={`lj-toast-item lj-toast-item--${t.tone}`}
                    onMouseEnter={() => pauseToast(t.id)}
                    onMouseLeave={() => resumeToast(t.id)}
                    onFocus={() => pauseToast(t.id)}
                    onBlur={() => resumeToast(t.id)}
                  >
                    <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[color:var(--lj-ink)]">{t.title}</p>
                      {t.description && <p className="lj-tiny lj-muted mt-0.5">{t.description}</p>}
                    </div>
                    {t.action &&
                      ("href" in t.action ? (
                        <Link href={t.action.href} className="lj-btn lj-btn--ghost lj-btn--sm text-[color:var(--lj-primary)]" onClick={() => dismissToast(t.id)}>
                          {t.action.label}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="lj-btn lj-btn--ghost lj-btn--sm text-[color:var(--lj-primary)]"
                          onClick={() => {
                            (t.action as { onClick: () => void }).onClick();
                            dismissToast(t.id);
                          }}
                        >
                          {t.action.label}
                        </button>
                      ))}
                    <button type="button" className="lj-btn lj-btn--ghost lj-btn--icon lj-btn--sm -mr-1" aria-label="Fechar notificação" onClick={() => dismissToast(t.id)}>
                      <X aria-hidden="true" />
                    </button>
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
