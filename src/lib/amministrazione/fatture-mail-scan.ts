import { xmlBlocks, xmlText } from "@/lib/amministrazione/fattura-pa-xml";

/** Caselle da controllare sempre. info@agrinsicilia vale anche con .com. */
export const CASELLE_FATTURE_MAIL = [
  "info@agrinsicilia",
  "angelo@agrinsicilia.com",
  "sandro@agrinsicilia.com",
] as const;

const PAROLA_FATTURA = /fattur|invoice|invoce/i;

export type EstrattoFatturaMail = {
  numeroDocumento: string;
  dataDocumento: string;
  fornitoreRagione: string;
  fornitorePiva: string;
  totale: number | null;
};

export type FatturaGiaNota = {
  id: string;
  numero: string;
  piva: string;
  totale: number | null;
  data: string;
  fonte: "registrata" | "sdi";
};

export function caselleFattureMancanti(emails: string[]): string[] {
  const set = emails.map((e) => e.trim().toLowerCase());
  const manca: string[] = [];
  const haInfo = set.some(
    (e) => e === "info@agrinsicilia" || e === "info@agrinsicilia.com"
  );
  if (!haInfo) manca.push("info@agrinsicilia");
  if (!set.includes("angelo@agrinsicilia.com")) {
    manca.push("angelo@agrinsicilia.com");
  }
  if (!set.includes("sandro@agrinsicilia.com")) {
    manca.push("sandro@agrinsicilia.com");
  }
  return manca;
}

export function testoParlaDiFattura(testo: string): boolean {
  return PAROLA_FATTURA.test(testo);
}

export function allegatoSembraFattura(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isInline: boolean;
}): boolean {
  const name = input.filename.trim().toLowerCase();
  const mime = input.mimeType.trim().toLowerCase();
  const extOk =
    /\.(pdf|xml|p7m|jpe?g|png|webp|heic|gif)$/.test(name) ||
    mime.includes("pdf") ||
    mime.includes("xml") ||
    mime.startsWith("image/");
  if (!extOk) return false;
  const piccolo = input.sizeBytes > 0 && input.sizeBytes < 80_000;
  const nomeLogo = /^(logo|signature|firma|image\d*|cid-)/.test(name);
  if (input.isInline && piccolo && !PAROLA_FATTURA.test(name)) return false;
  if (nomeLogo && piccolo) return false;
  return true;
}

export function normalizzaNumeroFattura(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizzaPiva(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function pivaCompatibili(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

export function chiaveFatturaMail(input: {
  piva: string;
  numero: string;
  totale: number | null;
  sha256: string;
}): string {
  const piva = normalizzaPiva(input.piva);
  const numero = normalizzaNumeroFattura(input.numero);
  if (piva && numero.length >= 2) return `piva:${piva}|n:${numero}`;
  if (input.sha256) return `sha:${input.sha256}`;
  if (numero.length >= 2 && input.totale != null) {
    return `n:${numero}|t:${input.totale.toFixed(2)}`;
  }
  return "";
}

export function trovaFatturaGiaPresente(
  input: {
    numero: string;
    piva: string;
    totale: number | null;
    data: string;
  },
  note: FatturaGiaNota[]
): FatturaGiaNota | null {
  const numero = normalizzaNumeroFattura(input.numero);
  if (numero.length < 2) return null;
  const piva = normalizzaPiva(input.piva);
  for (const nota of note) {
    if (normalizzaNumeroFattura(nota.numero) !== numero) continue;
    const stessaPiva = pivaCompatibili(piva, normalizzaPiva(nota.piva));
    if (piva && nota.piva && !stessaPiva) continue;
    if (!stessaPiva && input.totale != null && nota.totale != null) {
      if (Math.abs(input.totale - nota.totale) > 0.05) continue;
    }
    if (!stessaPiva && (input.totale == null || nota.totale == null)) {
      if (input.data && nota.data && input.data.slice(0, 7) !== nota.data.slice(0, 7)) {
        continue;
      }
    }
    return nota;
  }
  return null;
}

function parseTotale(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const it = t.match(/(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/);
  if (it) {
    const n = Number(it[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const en = t.match(/(\d+\.\d{2})/);
  if (!en) return null;
  const n = Number(en[1]);
  return Number.isFinite(n) ? n : null;
}

function parseDataIso(raw: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const it = /(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(raw);
  if (it) return `${it[3]}-${it[2]}-${it[1]}`;
  return "";
}

export function estraiDaXmlFattura(xml: string): EstrattoFatturaMail | null {
  if (!/FatturaElettronica|DatiGeneraliDocumento/i.test(xml)) return null;
  const cedente = xmlBlocks(xml, "CedentePrestatore")[0] ?? "";
  const doc = xmlBlocks(xml, "DatiGeneraliDocumento")[0] ?? "";
  const numero = xmlText(doc, "Numero").trim();
  const data = parseDataIso(xmlText(doc, "Data"));
  const totale = parseTotale(xmlText(doc, "ImportoTotaleDocumento"));
  const ragione =
    xmlText(cedente, "Denominazione").trim() ||
    [xmlText(cedente, "Nome"), xmlText(cedente, "Cognome")]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  const piva = xmlText(cedente, "IdCodice").trim();
  if (!numero && !ragione && totale == null) return null;
  return {
    numeroDocumento: numero,
    dataDocumento: data,
    fornitoreRagione: ragione,
    fornitorePiva: piva,
    totale,
  };
}

export function estraiDaTestoFattura(testo: string): EstrattoFatturaMail {
  const numeroMatch =
    /(?:fattura|invoice|n(?:umero|\.)?\s*(?:doc(?:umento)?|fattura)?)\s*[:\s°]*([A-Z0-9][A-Z0-9./-]{1,40})/i.exec(
      testo
    );
  const pivaMatch =
    /(?:p\.?\s*iva|partita\s+iva|vat)\s*[:\s]*((?:IT)?\d{11})/i.exec(testo);
  const dataMatch = /(\d{4}-\d{2}-\d{2}|\d{2}[/.-]\d{2}[/.-]\d{4})/.exec(testo);
  const totaleMatch =
    /(?:totale(?:\s+documento)?|amount|importo)\s*[:\s€]*([0-9.]+,\d{2}|[0-9]+\.\d{2})/i.exec(
      testo
    );
  return {
    numeroDocumento: (numeroMatch?.[1] ?? "").replace(/[.,;:]+$/, ""),
    dataDocumento: dataMatch ? parseDataIso(dataMatch[1]) : "",
    fornitoreRagione: "",
    fornitorePiva: (pivaMatch?.[1] ?? "").toUpperCase(),
    totale: totaleMatch ? parseTotale(totaleMatch[1]) : null,
  };
}

export function unisciEstratto(
  xml: EstrattoFatturaMail | null,
  testo: EstrattoFatturaMail
): EstrattoFatturaMail {
  if (!xml) return testo;
  return {
    numeroDocumento: xml.numeroDocumento || testo.numeroDocumento,
    dataDocumento: xml.dataDocumento || testo.dataDocumento,
    fornitoreRagione: xml.fornitoreRagione || testo.fornitoreRagione,
    fornitorePiva: xml.fornitorePiva || testo.fornitorePiva,
    totale: xml.totale ?? testo.totale,
  };
}

export function xmlNelFile(bytes: Buffer): string | null {
  const text = bytes.toString("utf8");
  const xml = text.indexOf("<?xml");
  const fat = text.search(/<([A-Za-z0-9]+:)?FatturaElettronica/i);
  const start = xml >= 0 ? xml : fat;
  if (start < 0) return null;
  return text.slice(start);
}
