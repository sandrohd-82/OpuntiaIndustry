/**
 * Stampa il prossimo timestamp di migrazione da accodare.
 * Uso: node scripts/next-migration-stamp.mjs
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d{14}_.+\.sql$/i.test(f))
  .sort();

const last = files.at(-1) ?? "00000000000000_none.sql";
const lastStamp = last.slice(0, 14);
const n = BigInt(lastStamp) + 10000n;
const next = String(n).padStart(14, "0");

console.log(`Ultima migrazione: ${last}`);
console.log(`Prossimo file:     ${next}_<slug>.sql`);
console.log(`Cartella:          ${dir}`);
