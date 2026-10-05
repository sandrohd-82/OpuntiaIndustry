import { fatturaClassicaDaXml } from "@/lib/amministrazione/fattura-pa-xml";
import { extractXmlFromPossiblySigned } from "@/lib/fic";
import type { AnteprimaSpesa } from "@/lib/fiscale/spese";
import { roundMoney } from "@/lib/amministrazione/fatture";

const DATA_RE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/;
const IMPORTO_RE = /(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})/g;

function vuota(): AnteprimaSpesa {
  return {
    esercente: "",
    partitaIva: "",
    dataDocumento: "",
    imponibile: null,
    aliquotaIva: null,
    imposta: null,
    totale: null,
    nazione: "",
    valuta: "EUR",
    righe: [],
    lettura: "manuale",
    letturaJson: null,
    partitaIvaAcquirente: "",
    uscitaImporto: null,
    ivaDetraibile: false,
    valenzaFiscale: "commerciale",
    avviso: "Compila i campi e conferma prima di registrare.",
  };
}

function parseImporto(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  let n: number;
  if (t.includes(",") && t.includes(".")) {
    n = Number(t.replace(/\./g, "").replace(",", "."));
  } else if (t.includes(",")) {
    n = Number(t.replace(",", "."));
  } else {
    n = Number(t);
  }
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

function importiInRiga(line: string): number[] {
  return [...line.matchAll(IMPORTO_RE)]
    .map((m) => parseImporto(m[1] ?? ""))
    .filter((n): n is number => n != null);
}

function dataIso(raw: string): string {
  const m = DATA_RE.exec(raw);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function importoVicino(lines: string[], pattern: RegExp): number | null {
  const line = [...lines].reverse().find((l) => pattern.test(l));
  if (!line) return null;
  const importi = importiInRiga(line);
  return importi.length ? importi[importi.length - 1] : null;
}

/** Legge totali, data ed esercente da un PDF che contiene già il testo. */
export function leggiTestoSpesa(text: string): AnteprimaSpesa {
  const base = vuota();
  const pulito = text.replace(/\r/g, "").trim();
  if (pulito.length < 20) {
    return {
      ...base,
      avviso:
        "Il PDF non ha testo leggibile (foto o scansione). Compila i campi a mano e conferma.",
    };
  }
  const lines = pulito
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const esercente =
    lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 80 &&
        /[A-Za-zÀ-ÿ]{3,}/.test(l) &&
        !/totale|imponibile|imposta|scontrino|documento|pagamento|iva\b/i.test(l)
    ) ?? "";
  const dataDocumento = dataIso(pulito);
  const totale =
    importoVicino(lines, /totale(?:\s+documento|\s+euro)?/i) ??
    importiInRiga(lines[lines.length - 1] ?? "").at(-1) ??
    null;
  const imponibile = importoVicino(lines, /imponibile/i);
  const imposta = importoVicino(lines, /\biva\b|imposta/i);
  const aliquotaMatch = pulito.match(/\b(\d{1,2})(?:[.,]\d+)?\s*%/);
  const aliquotaIva = aliquotaMatch ? Number(aliquotaMatch[1]) : null;
  let imp = imposta;
  let baseImp = imponibile;
  if (totale != null && aliquotaIva != null && baseImp == null) {
    baseImp = roundMoney(totale / (1 + aliquotaIva / 100));
    imp = roundMoney(totale - baseImp);
  }
  return {
    ...base,
    esercente,
    dataDocumento,
    imponibile: baseImp,
    aliquotaIva,
    imposta: imp,
    totale,
    righe: righeDaTesto(lines),
    lettura: "pdf",
    avviso:
      "Dati letti dal PDF. Controlla esercente, data e importi prima di registrare.",
  };
}

function righeDaTesto(lines: string[]) {
  const righe = [];
  for (const line of lines) {
    if (
      /totale|imponibile|imposta|subtotale|pagamento|resto|contanti|carta|documento commerciale/i.test(
        line
      )
    ) {
      continue;
    }
    const importi = importiInRiga(line);
    if (!importi.length) continue;
    const descrizione = line
      .replace(IMPORTO_RE, "")
      .replace(/\s+/g, " ")
      .trim();
    if (descrizione.length < 2) continue;
    righe.push({
      descrizione: descrizione.slice(0, 160),
      quantita: null,
      imponibile: null,
      aliquotaIva: null,
      imposta: null,
      totale: importi[importi.length - 1] ?? null,
    });
  }
  return righe;
}

export function leggiXmlSpesa(buffer: Buffer): AnteprimaSpesa {
  const base = vuota();
  const latin = buffer.toString("latin1");
  const utf = buffer.toString("utf8");
  const xml = extractXmlFromPossiblySigned(utf) ?? extractXmlFromPossiblySigned(latin);
  if (!xml) {
    return {
      ...base,
      avviso: "Nel file non ho trovato una fattura elettronica. Compila i campi a mano.",
    };
  }
  const model = fatturaClassicaDaXml(xml);
  const aliquota =
    model.ivaPercentuale > 0
      ? model.ivaPercentuale
      : model.aliquote.length === 1
        ? model.aliquote[0].aliquota
        : null;
  return {
    esercente: model.emittente.ragioneSociale.trim(),
    partitaIva: model.emittente.partitaIva.trim(),
    dataDocumento: model.dataDocumento,
    imponibile: model.imponibile || null,
    aliquotaIva: aliquota,
    imposta: model.imposta || null,
    totale: model.totale || null,
    nazione: model.emittente.nazione.trim(),
    valuta: "EUR",
    righe: [],
    letturaJson: null,
    partitaIvaAcquirente: "",
    lettura: "xml",
    ivaDetraibile: true,
    valenzaFiscale: "fattura",
    uscitaImporto: model.totale || null,
    avviso:
      "Dati letti dall'XML. Controlla fornitore, data e importi prima di registrare.",
  };
}
