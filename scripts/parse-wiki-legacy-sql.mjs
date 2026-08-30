/**
 * Estrae scientific_research dal dump MySQL legacy e produce JSON.
 * Uso: node scripts/parse-wiki-legacy-sql.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = "E:\\Progetti Cursor\\OpuntiaItaliaOld\\DB\\Sql1492355_1.sql";
const outDir = join(root, "data", "wiki-legacy");
const outFile = join(outDir, "scientific_research.json");

const ENTITIES = {
  "&agrave;": "à",
  "&Agrave;": "À",
  "&eacute;": "é",
  "&Eacute;": "É",
  "&egrave;": "è",
  "&Egrave;": "È",
  "&ecirc;": "ê",
  "&ugrave;": "ù",
  "&Ugrave;": "Ù",
  "&ograve;": "ò",
  "&Ograve;": "Ò",
  "&igrave;": "ì",
  "&Igrave;": "Ì",
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
  "&#34;": '"',
  "&#39;": "'",
  "&#8217;": "’",
  "&#8216;": "‘",
  "&#8211;": "–",
  "&#8212;": "—",
  "&#8220;": "“",
  "&#8221;": "”",
  "&#8230;": "…",
  "&#177;": "±",
  "&#181;": "µ",
  "&#8722;": "−",
  "&#8776;": "≈",
  "&#945;": "α",
  "&#946;": "β",
  "&#947;": "γ",
  "&#215;": "×",
  "&times;": "×",
};

function decodeHtml(s) {
  let out = s;
  for (const [k, v] of Object.entries(ENTITIES)) out = out.split(k).join(v);
  out = out.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });
  return out;
}

function parseValuesBlock(block) {
  const rows = [];
  let i = 0;
  while (i < block.length) {
    while (i < block.length && block[i] !== "(") i++;
    if (i >= block.length) break;
    i++;
    const fields = [];
    while (i < block.length) {
      while (i < block.length && /[\s,]/.test(block[i])) i++;
      if (block[i] === ")") {
        i++;
        break;
      }
      if (block[i] === "'") {
        i++;
        let buf = "";
        while (i < block.length) {
          const ch = block[i];
          if (ch === "\\" && i + 1 < block.length) {
            const n = block[i + 1];
            buf += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n;
            i += 2;
            continue;
          }
          if (ch === "'") {
            if (block[i + 1] === "'") {
              buf += "'";
              i += 2;
              continue;
            }
            i++;
            break;
          }
          buf += ch;
          i++;
        }
        fields.push(buf);
        continue;
      }
      let buf = "";
      while (i < block.length && !/[,\)]/.test(block[i])) {
        buf += block[i];
        i++;
      }
      fields.push(buf.trim());
    }
    if (fields.length >= 22) rows.push(fields);
  }
  return rows;
}

function deriveCategory(flags) {
  if (flags.cosmetic) return "Cosmetica";
  if (flags.nutrace) return "Nutrizione";
  if (flags.technical) return "Usi Industriali";
  if (flags.food) return "Agronomia";
  if (flags.pharma) return "Nutrizione";
  return "Agronomia";
}

function slugFromTitle(title, id) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "paper"}-${id}`;
}

const sql = readFileSync(src, "utf8");
const marker = "INSERT INTO `scientific_research`";
const inserts = [];
let from = 0;
while (from < sql.length) {
  const start = sql.indexOf(marker, from);
  if (start < 0) break;
  const valuesAt = sql.indexOf("VALUES", start);
  if (valuesAt < 0) break;
  const dataStart = valuesAt + "VALUES".length;
  const nextInsert = sql.indexOf(marker, start + marker.length);
  const alterAt = sql.indexOf("\nALTER TABLE", dataStart);
  const commentAt = sql.indexOf("\n--", dataStart);
  const endCandidates = [nextInsert, alterAt, commentAt, sql.length].filter(
    (n) => n > dataStart
  );
  const end = Math.min(...endCandidates);
  inserts.push([null, sql.slice(dataStart, end)]);
  from = start + marker.length;
}
if (!inserts.length) {
  throw new Error("Nessun INSERT scientific_research trovato");
}

const records = [];
for (const m of inserts) {
  for (const fields of parseValuesBlock(m[1])) {
    const num = (v) => Number(String(v).trim()) || 0;
    const flags = {
      cladodes: num(fields[3]) === 1,
      fruits: num(fields[4]) === 1,
      flowers: num(fields[5]) === 1,
      nutrace: num(fields[6]) === 1,
      pharma: num(fields[7]) === 1,
      food: num(fields[8]) === 1,
      cosmetic: num(fields[9]) === 1,
      veterina: num(fields[10]) === 1,
      technical: num(fields[11]) === 1,
      other: num(fields[12]) === 1,
      mostSearched: num(fields[13]) === 1,
      evidence: num(fields[20]) === 1,
      closed: num(fields[21]) === 1,
    };
    const plantParts = [];
    if (flags.cladodes) plantParts.push("cladodes");
    if (flags.fruits) plantParts.push("fruits");
    if (flags.flowers) plantParts.push("flowers");
    const sectors = [];
    if (flags.nutrace) sectors.push("nutrace");
    if (flags.pharma) sectors.push("pharma");
    if (flags.food) sectors.push("food");
    if (flags.cosmetic) sectors.push("cosmetic");
    if (flags.veterina) sectors.push("veterina");
    if (flags.technical) sectors.push("technical");
    if (flags.other) sectors.push("other");

    const id = num(fields[0]);
    const title = decodeHtml(String(fields[1] ?? "")).trim();
    records.push({
      legacyId: id,
      title,
      abstract: decodeHtml(String(fields[2] ?? "")).trim(),
      plantParts,
      sectors,
      isMostSearched: flags.mostSearched,
      isEvidence: flags.evidence,
      publishedYear: num(fields[14]),
      publishedMonth: Math.min(12, Math.max(1, num(fields[15]) || 1)),
      path: String(fields[17] ?? "").trim(),
      file: String(fields[18] ?? "").trim(),
      link: String(fields[19] ?? "").replace(/^-$/, "").trim(),
      closed: flags.closed,
      category: deriveCategory(flags),
      slug: slugFromTitle(title, id),
    });
  }
}

records.sort((a, b) => a.legacyId - b.legacyId);
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(records, null, 2), "utf8");
console.log(`Scritti ${records.length} record in ${outFile}`);
