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
 */

const BYPASS_SECRET =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_VERCEL_BYPASS_SECRET : undefined;

export function getApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = BYPASS_SECRET;
    headers["x-vercel-set-bypass-cookie"] = "true";
  }
  return headers;
}

export type ApiFetchOptions = RequestInit & { headers?: Record<string, string> };

export function apiFetch(
  url: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { headers: customHeaders, ...rest } = options;
  const headers = {
    ...getApiHeaders(),
    ...customHeaders,
  };
  return fetch(url, { ...rest, headers, credentials: "same-origin" });
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

export async function apiDelete(
  url: string,
  headers?: Record<string, string>
): Promise<void> {
  const res = await apiFetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      (data as { error?: string }).error ?? `Erro ${res.status}`,
      res.status,
      data
    );
  }
}
