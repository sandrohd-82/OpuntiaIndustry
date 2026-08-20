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
    "Data contabile;Data valuta;Dare;Avere;Descrizione",
    "16/07/2025;16/07/2025;25,28;;PAGAMENTO FORNITORE XYZ",
    "17/07/2025;17/07/2025;;1.234,56;Storno commissioni",
    "18/07/2025;18/07/2025;;;SALDO CONTABILE",
  ].join("\n"),
  "utf8"
);

const parsed = parseBankStatementCsv(sample);
assert.equal(parsed.lines.length, 2, "2 movimenti (saldo senza importo ignorato)");
assert.equal(parsed.lines[0]!.amount, -25.28);
assert.equal(parsed.lines[0]!.column, "DARE");
assert.equal(parsed.lines[1]!.amount, 1234.56);
assert.ok(parsed.lines[1]!.amount > 0, "storno +");

console.log("OK: bank-csv-parse smoke tests passed.");
