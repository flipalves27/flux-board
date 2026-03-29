import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { WebhookConnectTargets } from "./webhook-url";

export type WebhookPinnedPostOptions = {
  timeoutMs: number;
  maxResponseBytes: number;
  signal?: AbortSignal;
};

function pathWithQuery(url: URL): string {
  const p = url.pathname || "/";
  return p + (url.search || "");
}

function hostnameForRequestOptions(addrRaw: string): string {
  const raw = addrRaw.replace(/^\[|\]$/g, "");
  return net.isIPv6(raw) ? `[${raw}]` : raw;
}

/** SNI / verificação de certificado: hostname lógico do URL (não o IP de ligação). */
function tlsServernameFromUrl(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

function shouldTryNextConnectError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  const code = e?.code;
  return (
    code === "ECONNREFUSED" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    code === "ETIMEDOUT"
  );
}

function readResponseBody(res: http.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    res.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      chunks.push(buf);
      if (total > maxBytes) {
        settled = true;
        res.destroy();
        const all = Buffer.concat(chunks, total);
        resolve(`${all.subarray(0, maxBytes).toString("utf8")}…`);
      }
    });
    res.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, total).toString("utf8"));
    });
    res.on("error", reject);
  });
}

function postOnce(
  url: URL,
  connectAddr: string,
  headers: Record<string, string>,
  body: string,
  opts: WebhookPinnedPostOptions
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const hostname = hostnameForRequestOptions(connectAddr);
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    const path = pathWithQuery(url);

    const reqHeaders: http.OutgoingHttpHeaders = {
      ...headers,
      Host: url.host,
      "Content-Length": Buffer.byteLength(body, "utf8"),
    };

    const base: http.RequestOptions = {
      hostname,
      port,
      path,
      method: "POST",
      headers: reqHeaders,
      ...(opts.timeoutMs > 0 ? { timeout: opts.timeoutMs } : {}),
    };

    const onResponse = (res: http.IncomingMessage) => {
      void readResponseBody(res, opts.maxResponseBytes)
        .then((text) => {
          finish(() => resolve({ status: res.statusCode ?? 0, body: text }));
        })
        .catch((err) => finish(() => reject(err)));
    };

    const req =
      url.protocol === "https:"
        ? https.request({ ...base, servername: tlsServernameFromUrl(url) } as https.RequestOptions, onResponse)
        : http.request(base, onResponse);

    const onAbort = () => {
      req.destroy();
      finish(() => reject(new Error("The operation was aborted.")));
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    req.on("error", (err) => finish(() => reject(err)));
    if (opts.timeoutMs > 0) {
      req.on("timeout", () => {
        req.destroy();
        finish(() =>
          reject(Object.assign(new Error("Webhook POST timeout"), { code: "ETIMEDOUT" as const }))
        );
      });
    }

    req.on("close", () => {
      opts.signal?.removeEventListener("abort", onAbort);
    });

    req.write(body);
    req.end();
  });
}

/**
 * POST ao URL usando apenas os endereços já validados (sem nova resolução DNS do hostname).
 */
export async function postWebhookWithConnectTargets(
  targets: WebhookConnectTargets,
  headers: Record<string, string>,
  body: string,
  opts: WebhookPinnedPostOptions
): Promise<{ status: number; body: string }> {
  const { url, connectAddresses } = targets;
  let lastErr: unknown;
  for (let i = 0; i < connectAddresses.length; i++) {
    try {
      return await postOnce(url, connectAddresses[i], headers, body, opts);
    } catch (e) {
      lastErr = e;
      const tryNext = i < connectAddresses.length - 1 && shouldTryNextConnectError(e);
      if (!tryNext) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
