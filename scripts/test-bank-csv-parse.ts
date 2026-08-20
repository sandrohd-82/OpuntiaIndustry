import assert from "node:assert/strict";
import {
  parseBankStatementCsv,
  splitCsvLine,
  parseBankDateIt,
  parseCsvAmountStrict,
} from "../src/lib/amministrazione/bank-csv-parse";

assert.equal(parseBankDateIt("16/07/2025"), "2025-07-16");
assert.equal(splitCsvLine('a;"b;c";d', ";").join("|"), "a|b;c|d");
assert.equal(parseCsvAmountStrict("1.234,56"), 1234.56);
assert.equal(parseCsvAmountStrict("25,28"), 25.28);

const sample = Buffer.from(
  [
    "Data;Data Valuta;Uscite;Entrate;Causale",
    "16/07/2025;16/07/2025;25,28;;PAGAMENTO FORNITORE XYZ",
    "17/07/2025;17/07/2025;;1.234,56;Storno commissioni",
    "18/07/2025;18/07/2025;;;QUALSIASI RIGA ANCHE SALDO",
    "19/07/2025;19/07/2025;10,00;;DUPLICATO CONTENUTO",
    "19/07/2025;19/07/2025;10,00;;DUPLICATO CONTENUTO",
  ].join("\n"),
  "utf8"
);

const parsed = parseBankStatementCsv(sample);
assert.equal(parsed.lines.length, 5, "tutte le 5 righe dati");
assert.equal(parsed.lines[0]!.csvRaw.uscitaRaw, "25,28");
assert.equal(parsed.lines[0]!.csvRaw.causaleRaw, "PAGAMENTO FORNITORE XYZ");
assert.equal(parsed.lines[1]!.amount, 1234.56);
assert.equal(parsed.lines[2]!.amount, 0);
assert.equal(parsed.lines[3]!.trnOrCro, "csv-row:3");
assert.equal(parsed.lines[4]!.trnOrCro, "csv-row:4");
assert.ok(!parsed.parserModel.includes("openai"));
assert.equal(parsed.doubtful.length, 0);

console.log("OK: bank-csv local rigorous load tests passed.");
