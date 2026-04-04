/**
 * API client com suporte ao Vercel Deployment Protection Bypass.
 * Quando NEXT_PUBLIC_VERCEL_BYPASS_SECRET está definido, todas as requisições
 * incluem o header de bypass, permitindo que a app funcione com Protection
 * habilitada (Standard, Vercel Authentication, etc.) sem precisar definir
 * Protection para "None".
 *
 * Configuração: Vercel Dashboard → Settings → Deployment Protection →
 * Protection Bypass for Automation → gerar secret → adicionar variável
 * NEXT_PUBLIC_VERCEL_BYPASS_SECRET com o mesmo valor.
 *
 * Segurança: o valor é exposto no bundle do cliente. Headers de bypass **não** são enviados quando
 * `VERCEL_ENV=production` (exposto ao cliente como `NEXT_PUBLIC_VERCEL_ENV` via `next.config`).
 * Em preview/staging, rotacione o secret periodicamente.
 */

const BYPASS_SECRET =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_VERCEL_BYPASS_SECRET : undefined;

/** Bypass só fora de `VERCEL_ENV=production` (deploy público na Vercel). */
function vercelBypassAllowed(): boolean {
  const v = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "";
  return v !== "production";
}

export function getApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (BYPASS_SECRET && vercelBypassAllowed()) {
    headers["x-vercel-protection-bypass"] = BYPASS_SECRET;
    headers["x-vercel-set-bypass-cookie"] = "true";
  }
  return headers;
}

export type ApiFetchOptions = RequestInit & {
  headers?: Record<string, string>;
  _fluxRefreshAttempted?: boolean;
};

/** Uma única renovação em voo; evita N POSTs /api/auth/refresh quando várias APIs retornam 401 ao mesmo tempo. */
let refreshInFlight: Promise<boolean> | null = null;
/** Após 429 no refresh, não tentar de novo até passar a janela (evita loop com rate limit). */
let sessionRefreshBackoffUntilMs = 0;

function tryRefreshSessionOnce(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const now = Date.now();
  if (now < sessionRefreshBackoffUntilMs) return Promise.resolve(false);
  if (refreshInFlight) return refreshInFlight;

  const p = (async (): Promise<boolean> => {
    try {
      const refresh = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
      if (refresh.ok) {
        sessionRefreshBackoffUntilMs = 0;
        return true;
      }
      if (refresh.status === 429) {
        const ra = refresh.headers.get("Retry-After");
        const sec = parseInt(ra ?? "", 10);
        const waitMs = Number.isFinite(sec) && sec > 0 ? sec * 1000 : 60_000;
        sessionRefreshBackoffUntilMs = Date.now() + waitMs;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  refreshInFlight = p;
  return p;
}

export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { headers: customHeaders, _fluxRefreshAttempted, ...rest } = options;
  const extra = customHeaders ? (customHeaders as Record<string, string>) : {};
  const headers: Record<string, string> = {
    ...getApiHeaders(),
    ...extra,
  };
  // FormData exige boundary no Content-Type; getApiHeaders() força application/json e quebra request.formData() no servidor.
  if (typeof FormData !== "undefined" && rest.body instanceof FormData) {
    delete headers["Content-Type"];
  }
  const res = await fetch(url, { ...rest, headers, credentials: "same-origin" });

  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !_fluxRefreshAttempted &&
    typeof url === "string" &&
    !url.includes("/api/auth/refresh") &&
    !url.includes("/api/auth/logout")
  ) {
    const refreshed = await tryRefreshSessionOnce();
    if (refreshed) {
      return apiFetch(url, { ...options, _fluxRefreshAttempted: true });
    }
  }

  return res;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiJson<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const res = await apiFetch(url, options);
  const data = await res.json().catch(() => ({})) as { error?: string } & T;
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? `Erro ${res.status}`,
      res.status,
      data
    );
  }
  return data as T;
}

export async function apiPost<T = unknown>(
  url: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

export async function apiGet<T = unknown>(
  url: string,
  headers?: Record<string, string>
): Promise<T> {
  return apiJson<T>(url, { method: "GET", headers });
}

export async function apiPut<T = unknown>(
  url: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<T> {
  return apiJson<T>(url, {
    method: "PUT",
    body: JSON.stringify(body),
    headers,
  });
}

export async function apiPatch<T = unknown>(
  url: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<T> {
  return apiJson<T>(url, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers,
  });
}

export async function apiDelete(
  url: string,
  headers?: Record<string, string>,
  extra?: Omit<ApiFetchOptions, "method" | "headers">
): Promise<void> {
  const res = await apiFetch(url, { method: "DELETE", headers, ...extra });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      (data as { error?: string }).error ?? `Erro ${res.status}`,
      res.status,
      data
    );
  }
}
