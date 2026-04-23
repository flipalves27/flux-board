import { describe, expect, it } from "vitest";
import { decryptOrgAiSecrets, encryptOrgAiSecrets } from "@/lib/org-ai-secrets-crypto";

describe("org-ai-secrets-crypto", () => {
  const master = "a".repeat(32);

  it("round-trips API key and optional base URL", () => {
    const enc = encryptOrgAiSecrets({ togetherApiKey: "sk-test", togetherBaseUrl: "https://example.com/v1" }, master);
    const dec = decryptOrgAiSecrets(enc, master);
    expect(dec).toEqual({ togetherApiKey: "sk-test", togetherBaseUrl: "https://example.com/v1" });
  });

  it("returns null for wrong master", () => {
    const enc = encryptOrgAiSecrets({ togetherApiKey: "k" }, master);
    expect(decryptOrgAiSecrets(enc, "b".repeat(32))).toBeNull();
  });

  it("returns null for invalid blob", () => {
    expect(decryptOrgAiSecrets("not-v1", master)).toBeNull();
  });
});
