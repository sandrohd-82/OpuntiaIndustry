/**
 * Smoke tests parser banca (senza Jest).
 * Esegui: npx tsx scripts/test-bank-pdf-parse.ts
 */
import {
  applySignRules,
  extractItAmounts,
  parseBankAiJson,
  parseItAmount,
  repairBankAiJson,
  validateLines,
  type ParsedBankLine,
} from "../src/lib/amministrazione/bank-pdf-parse";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

// Magnitudini IT
assert(parseItAmount("25,28") === 25.28, "25,28 → 25.28");
assert(parseItAmount("1.234,56") === 1234.56, "1.234,56 → 1234.56");
assert(parseItAmount("25.280", { strict: true }) === null, "25.280 strict → null");
assert(parseItAmount("25.280") === 25280, "25.280 non-strict → 25280");

// No glue data+importo
const glued = extractItAmounts("16/07/202525,28 STORNO");
assert(
  glued.includes("25,28") && !glued.some((t) => t.includes("2025")),
  "date strip: solo 25,28"
);

// Colonna batte causale storno? NO: Storno forza +
const stornoDare = applySignRules({
  description: "STORNO COMMISSIONI",
  amount: 25.28,
  column: "DARE",
});
assert(stornoDare.amount === 25.28, "STORNO forza + anche se colonna DARE");

const stornoAvere = applySignRules({
  description: "STORNO COMMISSIONI",
  amount: 25.28,
  column: "AVERE",
});
assert(stornoAvere.amount === 25.28, "STORNO in AVERE → +25.28");

const bonifico = applySignRules({
  description: "Bonifico a vs favore ACME SPA",
  amount: 100,
  column: "DARE",
});
assert(bonifico.amount === 100, "Bonifico a vs favore forza +");

const interessi = applySignRules({
  description: "Interessi passivi trimestre",
  amount: 12.5,
  column: "AVERE",
});
assert(interessi.amount === -12.5, "Interessi forza −");

// F24 versamento non deve diventare entrata
const f24 = applySignRules({
  description: "DELEGA F24 - VERSAMENTO UNITARIO",
  amount: 150,
  column: null,
});
assert(f24.amount === -150, "F24 versamento unitario → −");

// Inferenza colonna vietata: senza colonna, + AI → default DARE
const noCol = applySignRules({
  description: "PAGAMENTO FORNITORE XYZ",
  amount: 500,
  column: null,
});
assert(noCol.amount === -500, "senza colonna default −");

// validateLines: saldo escluso + amountIt
const raw: ParsedBankLine[] = [
  {
    transactionDate: "2025-07-16",
    valutaDate: null,
    amount: 25280,
    description: "STORNO COMM",
    counterpartyName: "",
    trnOrCro: "",
    column: "AVERE",
    amountIt: "25,28",
  },
  {
    transactionDate: "2025-07-16",
    valutaDate: null,
    amount: 25280,
    description: "SALDO CONTABILE",
    counterpartyName: "",
    trnOrCro: "",
    column: "AVERE",
    amountIt: "25.280,00",
  },
];
const v = validateLines(raw);
assert(v.lines.length === 1, "una sola voce dopo validazione");
assert(v.lines[0].amount === 25.28, "amountIt 25,28 vince su 25280");
assert(v.excluded.length === 1, "saldo escluso");
assert(v.doubtful.length === 0, "storno non richiede conferma");
assert(v.lines[0].signNeedsReview !== true, "storno auto ok");

// Senza colonna → da confermare
const v2 = validateLines([
  {
    transactionDate: "2025-07-16",
    valutaDate: null,
    amount: 100,
    description: "MOVIMENTO SENZA COLONNA",
    counterpartyName: "",
    trnOrCro: "",
    column: null,
    amountIt: "100,00",
  },
]);
assert(v2.lines.length === 1, "voce senza colonna importata");
assert(v2.lines[0].signNeedsReview === true, "senza colonna → review");
assert(v2.doubtful.length === 1, "dubbio conteggiato");

// Riparazione JSON con virgola italiana non quotata
const broken = `{"lines":[{"transactionDate":"2025-07-16","amountIt":25,28,"column":"AVERE","description":"STORNO"}]}`;
const fixed = repairBankAiJson(broken);
assert(fixed.includes('"25,28"'), "repair quota amountIt italiano");
const parsedBroken = parseBankAiJson(broken);
assert(
  String((parsedBroken.lines?.[0] as { amountIt?: string })?.amountIt) ===
    "25,28",
  "parseBankAiJson ripara 25,28"
);

// Truncated JSON → jsonrepair chiude le parentesi
const truncated = `{"lines":[{"transactionDate":"2025-07-16","amountCents":2528,"column":"DARE","description":"X"`;
const parsedTrunc = parseBankAiJson(truncated);
assert(
  Array.isArray(parsedTrunc.lines) && parsedTrunc.lines.length === 1,
  "jsonrepair recupera JSON troncato"
);

console.log("\nAll bank-pdf-parse smoke tests passed.");
