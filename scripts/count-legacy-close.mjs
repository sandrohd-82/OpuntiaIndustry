/**
 * Conta close=0 / close=1 dal dump MySQL scientifico.
 * Uso: node scripts/count-legacy-close.mjs
 */
import { readFileSync } from "node:fs";

const src = "E:\\Progetti Cursor\\OpuntiaItaliaOld\\DB\\Sql1492355_1.sql";
const sql = readFileSync(src, "utf8");
const marker = "INSERT INTO `scientific_research`";

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
            i += 2;
            continue;
          }
          if (ch === "'") {
            if (block[i + 1] === "'") {
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
      while (i < block.length && !/[,)]/.test(block[i])) {
        buf += block[i];
        i++;
      }
      fields.push(buf.trim());
    }
    if (fields.length) rows.push(fields);
  }
  return rows;
}

const rows = [];
let from = 0;
while (from < sql.length) {
  const start = sql.indexOf(marker, from);
  if (start < 0) break;
  const valuesAt = sql.indexOf("VALUES", start);
  const dataStart = valuesAt + "VALUES".length;
  const nextInsert = sql.indexOf(marker, start + marker.length);
  const alterAt = sql.indexOf("\nALTER TABLE", dataStart);
  const end = Math.min(
    ...[nextInsert, alterAt, sql.length].filter((n) => n > dataStart)
  );
  rows.push(...parseValuesBlock(sql.slice(dataStart, end)));
  from = start + marker.length;
}

let close0 = 0;
let close1 = 0;
const odd = [];
for (const f of rows) {
  const close = String(f[21] ?? f[f.length - 1]);
  if (close === "0") close0 += 1;
  else if (close === "1") close1 += 1;
  else odd.push({ id: f[0], fields: f.length, close, last: f[f.length - 1] });
}

console.log(JSON.stringify({
  file: src,
  rows: rows.length,
  close0_download_libero: close0,
  close1_richiesta_email: close1,
  odd,
  fieldCounts: [...new Set(rows.map((r) => r.length))],
}, null, 2));
