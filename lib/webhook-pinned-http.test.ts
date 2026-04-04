/** @vitest-environment node */
import http from "node:http";
import { describe, expect, it } from "vitest";
import { postWebhookWithConnectTargets } from "./webhook-pinned-http";
import type { WebhookConnectTargets } from "./webhook-url";

describe("postWebhookWithConnectTargets", () => {
  it("liga ao IP fixado e envia corpo", async () => {
    await new Promise<void>((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        let body = "";
        req.on("data", (c) => {
          body += c;
        });
        req.on("end", () => {
          expect(body).toBe('{"x":1}');
          res.writeHead(200, { "Content-Length": Buffer.byteLength("pong", "utf8") });
          res.end("pong");
        });
        req.on("error", reject);
      });
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("expected TCP address"));
          return;
        }
        const port = addr.port;
        const targets: WebhookConnectTargets = {
          url: new URL(`http://virtual-host:${port}/webhook?k=1`),
          connectAddresses: ["127.0.0.1"],
        };
        void postWebhookWithConnectTargets(
          targets,
          { "Content-Type": "application/json", "X-Test": "1" },
          '{"x":1}',
          { timeoutMs: 8000, maxResponseBytes: 4096 }
        )
          .then((r) => {
            expect(r.status).toBe(200);
            expect(r.body).toBe("pong");
            srv.close(() => resolve());
          })
          .catch((e) => {
            srv.close(() => reject(e));
          });
      });
      srv.on("error", reject);
    });
  });
});
