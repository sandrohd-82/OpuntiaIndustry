import assert from "node:assert/strict";
import {
  parseBankStatementCsv,
  splitCsvLine,
  parseBankDateIt,
} from "../src/lib/amministrazione/bank-csv-parse";

assert.equal(parseBankDateIt("16/07/2025"), "2025-07-16");
assert.equal(splitCsvLine('a;"b;c";d', ";").join("|"), "a|b;c|d");

const sample = Buffer.from(
  [
    "Data;Data Valuta;Uscite;Entrate;Causale",
    "16/07/2025;16/07/2025;25,28;;PAGAMENTO FORNITORE XYZ",
    "17/07/2025;17/07/2025;;1.234,56;Storno commissioni",
    "18/07/2025;18/07/2025;;;QUALSIASI RIGA ANCHE SALDO",
  ].join("\n"),
  "utf8"
);

const parsed = parseBankStatementCsv(sample);
assert.equal(parsed.lines.length, 3, "tutte le 3 righe dati (header escluso)");
assert.equal(parsed.lines[0]!.amount, -25.28);
assert.equal(parsed.lines[0]!.column, "DARE");
assert.equal(parsed.lines[1]!.amount, 1234.56);
assert.equal(parsed.lines[1]!.column, "AVERE");
assert.equal(parsed.lines[2]!.amount, 0);
assert.equal(parsed.doubtful.length, 0);
assert.equal(parsed.excluded.length, 0);

// Senza header: nessuna riga saltata
const noHeader = Buffer.from(
  "01/08/2025;01/08/2025;10,00;;A\n02/08/2025;02/08/2025;;20,00;B\n",
  "utf8"
);
const p2 = parseBankStatementCsv(noHeader);
assert.equal(p2.lines.length, 2, "senza header: 2/2");

console.log("OK: bank-csv-parse fixed 5-col tests passed.");
