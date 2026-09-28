"use client";

import { useEffect, useId, useRef } from "react";

/*
 * Cheap anti-bot signals for the public forms (checkout order and e-mail
 * opt-ins). Contract with the API (POST /api/loja/orders and
 * /api/loja/subscribe): the JSON body carries
 *   - `hp`: value of a honeypot field people never see (must be "");
 *   - `elapsedMs`: integer ms between the form first showing and the send.
 * The server answers 400 {"error":"invalid_body"} when `hp` is filled or
 * `elapsedMs` is implausibly small.
 *
 * A real person must never trip it:
 *  - the honeypot is off-screen (not display:none, which naive bots skip),
 *    out of the tab order, hidden from assistive tech, and has a name no
 *    browser/password-manager autofill profile maps to, plus the managers'
 *    own "ignore me" attributes;
 *  - if someone (autofill + fast click) sends before the form's minimum,
 *    the send is simply held until that much time has passed — the button
 *    already shows the "sending" spinner, so it just feels like a slower
 *    request. These minimums are deliberately ABOVE the server thresholds
 *    (lib/loja-antibot.ts: order 2500 ms, subscribe 1200 ms).
 */
export const MIN_FILL_MS = { order: 3000, subscribe: 1500 } as const;

export function useAntiBot(minMs: number) {
  const shownAt = useRef<number | null>(null);
  const trapRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  /** Call from the submit handler (never during render). */
  async function antiBotFields(): Promise<{ hp: string; elapsedMs: number }> {
    const start = shownAt.current ?? performance.now();
    let elapsed = performance.now() - start;
    if (elapsed < minMs) {
      await new Promise((resolve) => window.setTimeout(resolve, minMs - elapsed));
      elapsed = performance.now() - start;
    }
    return { hp: (trapRef.current?.value ?? "").slice(0, 200), elapsedMs: Math.round(elapsed) };
  }

  return { trapRef, antiBotFields };
}

export function HoneypotField({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const id = useId();
  return (
    <div className="lj-hp" aria-hidden="true">
      <label htmlFor={id}>Deixe em branco</label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        name="vf_url_confirm"
        autoComplete="off"
        tabIndex={-1}
        defaultValue=""
        data-1p-ignore=""
        data-lpignore="true"
        data-bwignore=""
        data-form-type="other"
      />
    </div>
  );
}
