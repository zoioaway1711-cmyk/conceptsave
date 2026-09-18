const WINDOWS = { "5m": 5 * 60_000, "30m": 30 * 60_000, "1h": 60 * 60_000, "24h": 24 * 60 * 60_000 } as const;
export type LiveWindow = keyof typeof WINDOWS;

export function isLiveWindow(value: string | null): value is LiveWindow {
  return value !== null && value in WINDOWS;
}

export function windowStartIso(window: LiveWindow, now = Date.now()): string {
  return new Date(now - WINDOWS[window]).toISOString();
}
