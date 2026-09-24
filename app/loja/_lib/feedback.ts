"use client";

import { useSyncExternalStore } from "react";

/*
 * One toast queue for the whole store. Components call `notify()`; the
 * single <Toaster/> in the layout renders it. Toasts are for confirming an
 * action that happened away from where the user is looking (saved a
 * favorite from a card, restored an item). Anything tied to a form field
 * stays inline next to the field instead.
 */

export type ToastTone = "success" | "info" | "error";
export type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void } | { label: string; href: string };
};

const MAX_VISIBLE = 3;
const DURATION_MS = 5000;

let toasts: Toast[] = [];
let nextId = 1;
const timers = new Map<number, number>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function pauseToast(id: number) {
  window.clearTimeout(timers.get(id));
}

export function resumeToast(id: number) {
  window.clearTimeout(timers.get(id));
  timers.set(id, window.setTimeout(() => dismissToast(id), DURATION_MS));
}

export function notify(toast: Omit<Toast, "id">) {
  const id = nextId++;
  // Same title twice in a row (e.g. rapid heart taps) replaces, not stacks.
  toasts = [...toasts.filter((t) => t.title !== toast.title), { ...toast, id }].slice(-MAX_VISIBLE);
  emit();
  resumeToast(id);
  return id;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: Toast[] = [];

export function useToasts() {
  return useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
}
