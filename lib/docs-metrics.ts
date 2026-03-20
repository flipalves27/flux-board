export function logDocsMetric(event: string, payload: Record<string, unknown>) {
  try {
    const base = {
      ts: new Date().toISOString(),
      event,
      ...payload,
    };
    console.info("[docs-metrics]", JSON.stringify(base));
  } catch {
    // no-op
  }
}
