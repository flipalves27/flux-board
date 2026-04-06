/**
 * One-shot codemod: substitui padrões comuns de err.message em app/api (route.ts)
 * por publicApiErrorResponse. Executar da raiz: node scripts/apply-public-api-error.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const apiRoot = path.join(repoRoot, "app", "api");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name === "route.ts") acc.push(p);
  }
  return acc;
}

function relAppPosix(file) {
  return path.relative(path.join(repoRoot, "app"), file).replace(/\\/g, "/");
}

function addImports(content, names) {
  const uniq = [...new Set(names)].filter((n) => n);
  if (uniq.length === 0) return content;
  const existing = content.match(/import \{([^}]+)\} from "@\/lib\/public-api-error";/);
  if (existing) {
    const set = new Set(
      existing[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    for (const n of uniq) set.add(n);
    return content.replace(
      /import \{([^}]+)\} from "@\/lib\/public-api-error";/,
      `import { ${[...set].join(", ")} } from "@/lib/public-api-error";`
    );
  }
  const importLine = `import { ${uniq.join(", ")} } from "@/lib/public-api-error";\n`;
  const m = content.match(/^(import .*\n)+/);
  if (m) return content.replace(/^(import .*\n)+/, (b) => b + importLine);
  return importLine + content;
}

function transform(content, ctx) {
  let c = content;

  const pairs = [
    [
      'return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });',
      `return publicApiErrorResponse(err, { context: "${ctx}" });`,
    ],
    [
      'return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 400 });',
      `return publicApiErrorResponse(err, { context: "${ctx}", status: 400, fallbackMessage: "Pedido inválido. Tente novamente." });`,
    ],
    [
      'return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao aplicar" }, { status: 500 });',
      `return publicApiErrorResponse(err, { context: "${ctx}", fallbackMessage: "Erro ao aplicar." });`,
    ],
    [
      'return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao salvar configuração." }, { status: 500 });',
      `return publicApiErrorResponse(err, { context: "${ctx}", fallbackMessage: "Erro ao salvar configuração." });`,
    ],
    [
      `return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );`,
      `return publicApiErrorResponse(err, { context: "${ctx}" });`,
    ],
    [
      `return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );`,
      `return publicApiErrorResponse(err, { context: "${ctx}", fallbackMessage: "Internal error" });`,
    ],
    [
      'return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao converter BPMN." }, { status: 400 });',
      `return publicApiErrorResponse(e, { context: "${ctx}", status: 400, fallbackMessage: "Falha ao converter BPMN." });`,
    ],
    [
      'return NextResponse.json({ error: e instanceof Error ? e.message : "Datas inválidas" }, { status: 400 });',
      `return publicApiErrorResponse(e, { context: "${ctx}", status: 400, fallbackMessage: "Datas inválidas." });`,
    ],
    [
      'const message = err instanceof Error ? err.message : "Erro ao gerar documento.";',
      `const message = publicErrorMessage(err, "Erro ao gerar documento.", "${ctx}");`,
    ],
    [
      'const message = err instanceof Error ? err.message : "Erro interno na Fluxy.";',
      `const message = publicErrorMessage(err, "Erro interno na Fluxy.", "${ctx}");`,
    ],
    [
      'message: err instanceof Error ? err.message : "Erro ao executar tool.",',
      `message: publicErrorMessage(err, "Erro ao executar tool.", "${ctx}"),`,
    ],
    [
      'errorMessage: err instanceof Error ? err.message : "Erro de rede ao chamar a IA.",',
      `errorMessage: publicErrorMessage(err, "Erro de rede ao chamar a IA.", "${ctx}"),`,
    ],
  ];

  for (const [a, b] of pairs) {
    c = c.split(a).join(b);
  }

  return c;
}

function patchFile(file) {
  const orig = fs.readFileSync(file, "utf8");
  const ctx = relAppPosix(file);
  let content = transform(orig, ctx);
  if (content === orig) return false;

  const names = [];
  if (content.includes("publicApiErrorResponse")) names.push("publicApiErrorResponse");
  if (content.includes("publicErrorMessage")) names.push("publicErrorMessage");
  if (content.includes("publicSseErrorPayload")) names.push("publicSseErrorPayload");
  content = addImports(content, names);
  fs.writeFileSync(file, content);
  return true;
}

const files = walk(apiRoot);
let n = 0;
for (const f of files) {
  if (patchFile(f)) {
    console.log("patched", path.relative(repoRoot, f));
    n++;
  }
}
console.log("done,", n, "files");
