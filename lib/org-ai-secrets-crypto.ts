import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const VERSION = 1;
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const SALT = "flux-org-ai-secrets-v1";

export type OrgAiSecretsPayload = {
  togetherApiKey?: string;
  togetherBaseUrl?: string;
  /** PEM for GitHub App (optional; prefer FLUX_GITHUB_APP_PRIVATE_KEY in env). */
  githubAppPrivateKeyPem?: string;
};

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, 32);
}

/** Returns `v1:` + base64(iv + ciphertext + tag). */
export function encryptOrgAiSecrets(payload: OrgAiSecretsPayload, masterSecret: string): string {
  const key = deriveKey(masterSecret.trim());
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: 16 });
  const json = JSON.stringify({ v: VERSION, ...payload });
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([iv, enc, tag]);
  return `v1:${out.toString("base64url")}`;
}

export function decryptOrgAiSecrets(blob: string, masterSecret: string): OrgAiSecretsPayload | null {
  const raw = String(blob || "").trim();
  if (!raw.startsWith("v1:")) return null;
  const b64 = raw.slice(3);
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64url");
  } catch {
    return null;
  }
  if (buf.length < IV_LEN + 17) return null;
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(IV_LEN, buf.length - 16);
  try {
    const key = deriveKey(masterSecret.trim());
    const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as {
      v?: number;
      togetherApiKey?: string;
      togetherBaseUrl?: string;
      githubAppPrivateKeyPem?: string;
    };
    if (parsed.v !== VERSION) return null;
    return {
      togetherApiKey: typeof parsed.togetherApiKey === "string" ? parsed.togetherApiKey : undefined,
      togetherBaseUrl: typeof parsed.togetherBaseUrl === "string" ? parsed.togetherBaseUrl : undefined,
      githubAppPrivateKeyPem:
        typeof parsed.githubAppPrivateKeyPem === "string" ? parsed.githubAppPrivateKeyPem : undefined,
    };
  } catch {
    return null;
  }
}

export function getOrgAiSecretsMasterKey(): string | null {
  const k = process.env.FLUX_AI_SECRETS_KEY?.trim();
  return k && k.length >= 16 ? k : null;
}
