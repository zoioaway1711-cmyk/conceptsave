/** Thin client-side fetch wrapper for /api/admin/* calls: always same-origin, never caches, and gives callers a typed { ok, status, data } shape instead of throwing on non-2xx. */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export async function apiFetch<T = unknown>(
  input: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(input, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const error = (body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string")
        ? (body as { error: string }).error
        : `http_${response.status}`;
      return { ok: false, status: response.status, error };
    }
    return { ok: true, status: response.status, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export function apiPost<T = unknown>(input: string, body: unknown) {
  return apiFetch<T>(input, { method: "POST", body: JSON.stringify(body) });
}

export function apiPatch<T = unknown>(input: string, body: unknown) {
  return apiFetch<T>(input, { method: "PATCH", body: JSON.stringify(body) });
}
