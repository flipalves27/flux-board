/**
 * Corrige imports partidos: move `public-api-error` para depois do bloco `import { ... } from "..."` afetado.
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
    else if (name === "route.ts" || name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

const BLOCK =
  /import \{\r?\nimport \{ ([^}]+)\} from "@\/lib\/public-api-error";\r?\n([\s\S]*?)\} from "([^"]+)";/g;

function fix(content) {
  return content.replace(BLOCK, (full, pubNames, middle, mod) => {
    const names = String(pubNames).trim();
    return `import {\n${middle}} from "${mod}";\nimport { ${names} } from "@/lib/public-api-error";`;
  });
}

let fixed = 0;
for (const file of walk(apiRoot)) {
  const c = fs.readFileSync(file, "utf8");
  if (!c.includes('import {\nimport {') && !c.includes('import {\r\nimport {')) continue;
  const next = fix(c);
  if (next !== c) {
    fs.writeFileSync(file, next);
    console.log("fixed", path.relative(repoRoot, file));
    fixed++;
  }
}
console.log("total", fixed);
