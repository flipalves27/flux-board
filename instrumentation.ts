export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertJwtSecretConfigured } = await import("./lib/jwt-secret");
    assertJwtSecretConfigured();
  }
}
