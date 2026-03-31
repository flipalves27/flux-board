export function sanitizeJsonCandidate(value: string): string {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

export function extractFirstBalancedJsonObject(value: string): string | null {
  const input = String(value || "");
  const start = input.indexOf("{");
  if (start < 0) return null;

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return input.slice(start, i + 1).trim();
    }
  }

  return null;
}

export function parseJsonFromLlmContent(raw: string): { parsed: unknown; recovered: boolean } {
  const direct = String(raw || "").trim();
  if (!direct) return { parsed: {}, recovered: true };

  const tryParse = (s: string): { parsed: unknown; recovered: boolean } => {
    try {
      return { parsed: JSON.parse(s), recovered: false };
    } catch {
      return { parsed: {}, recovered: true };
    }
  };

  try {
    return { parsed: JSON.parse(direct), recovered: false };
  } catch {
    // continue
  }

  const sanitized = sanitizeJsonCandidate(direct);
  try {
    return { parsed: JSON.parse(sanitized), recovered: true };
  } catch {
    // continue
  }

  const balanced = extractFirstBalancedJsonObject(raw);
  if (balanced) {
    const s = sanitizeJsonCandidate(balanced);
    try {
      return { parsed: JSON.parse(s), recovered: true };
    } catch {
      // continue
    }
  }

  const m = String(raw || "").match(/\{[\s\S]*\}/);
  if (m?.[0]) {
    const s = sanitizeJsonCandidate(m[0]);
    try {
      return { parsed: JSON.parse(s), recovered: true };
    } catch {
      // continue
    }
  }

  return tryParse(direct);
}

