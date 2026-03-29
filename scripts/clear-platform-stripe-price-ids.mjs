#!/usr/bin/env node
/**
 * Remove campos stripePriceId* do documento `default` em `platform_commercial_settings`,
 * para o checkout usar apenas STRIPE_PRICE_ID_* (Vercel / .env).
 *
 * Uso:
 *   MONGODB_URI="..." [MONGODB_DB="..."] node scripts/clear-platform-stripe-price-ids.mjs
 *   MONGODB_URI="..." node scripts/clear-platform-stripe-price-ids.mjs --dry-run
 *   MONGODB_URI="..." node scripts/clear-platform-stripe-price-ids.mjs --only-invalid
 *
 * Por omissão: remove os quatro campos (Pro/Business mensal e anual) se existirem.
 * --only-invalid: remove só campos cujo valor não é um id price_… (ex.: 19,99).
 * --dry-run: apenas mostra o que seria alterado.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error("Defina MONGODB_URI ou MONGO_URI.");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB;
const dryRun = process.argv.includes("--dry-run");
const onlyInvalid = process.argv.includes("--only-invalid");

const COL = "platform_commercial_settings";
const DOC_ID = "default";

const PRICE_ID_FIELDS = [
  "stripePriceIdPro",
  "stripePriceIdBusiness",
  "stripePriceIdProAnnual",
  "stripePriceIdBusinessAnnual",
];

function isValidStripePriceId(value) {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  return /^price_[A-Za-z0-9_-]+$/.test(s);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = dbName ? client.db(dbName) : client.db();
    const col = db.collection(COL);
    const doc = await col.findOne({ _id: DOC_ID });

    if (!doc) {
      console.log(`Coleção ${COL}: documento "${DOC_ID}" não existe. Nada a fazer.`);
      return;
    }

    /** @type {Record<string, string>} */
    const unset = {};
    for (const field of PRICE_ID_FIELDS) {
      if (!(field in doc)) continue;
      const v = doc[field];
      if (onlyInvalid) {
        if (isValidStripePriceId(v)) continue;
        unset[field] = "";
      } else {
        unset[field] = "";
      }
    }

    const keys = Object.keys(unset);
    if (!keys.length) {
      console.log(
        onlyInvalid
          ? "Nenhum campo stripePriceId* inválido encontrado (ou já ausentes)."
          : "Nenhum dos campos stripePriceId* está presente no documento."
      );
      return;
    }

    if (dryRun) {
      console.log(`[dry-run] Seriam removidos ${keys.length} campo(s): ${keys.join(", ")} (valores não são exibidos).`);
      return;
    }

    await col.updateOne({ _id: DOC_ID }, { $unset: unset });
    console.log(`Removidos os campos: ${keys.join(", ")}.`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
