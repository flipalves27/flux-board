const MIN_LEN = 32;

let cached: string | null = null;

/**
 * Segredo HMAC para JWT. Obrigatório em todos os ambientes — sem fallback literal.
 */
export function getJwtSecret(): string {
  if (cached) return cached;
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < MIN_LEN) {
    throw new Error(
      `JWT_SECRET deve estar definido e ter pelo menos ${MIN_LEN} caracteres (defina no .env ou no provedor de hospedagem).`
    );
  }
  cached = s;
  return cached;
}

export function assertJwtSecretConfigured(): void {
  getJwtSecret();
}
