import { xmlBlocks, xmlText } from "@/lib/amministrazione/fattura-pa-xml";

/** Caselle da controllare sempre. info@agrinsicilia vale anche con .com. */
export const CASELLE_FATTURE_MAIL = [
  "info@agrinsicilia",
  "angelo@agrinsicilia.com",
  "sandro@agrinsicilia.com",
] as const;

const PAROLA_FATTURA = /\bfattur(?:a|e|azione)\b|\binvoice\b|\binvoce\b/i;

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

const DIECI_GIORNI_MS = 10 * 24 * 60 * 60 * 1000;

export function spostaGiorniIso(iso: string, giorni: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

export function entroDieciGiorni(a: string, b: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return false;
  }
  const da = Date.parse(`${a}T12:00:00.000Z`);
  const db = Date.parse(`${b}T12:00:00.000Z`);
  return Math.abs(da - db) <= DIECI_GIORNI_MS;
}

/** Confronto solo nella finestra della data fattura: 10 giorni prima e 10 dopo. */
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
  if (numero.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(input.data)) return null;
  const piva = normalizzaPiva(input.piva);
  for (const nota of note) {
    if (!entroDieciGiorni(input.data, nota.data)) continue;
    if (normalizzaNumeroFattura(nota.numero) !== numero) continue;
    const stessaPiva = pivaCompatibili(piva, normalizzaPiva(nota.piva));
    if (piva && nota.piva && !stessaPiva) continue;
    if (!stessaPiva && input.totale != null && nota.totale != null) {
      if (Math.abs(input.totale - nota.totale) > 0.05) continue;
    }
    return nota;
  }
  return null;
}

export function fraseCorrispondenzaFattura(nota: FatturaGiaNota | null): {
  esito: "trovata" | "assente";
  testo: string;
} {
  if (!nota) {
    return { esito: "assente", testo: "Nessuna fattura corrispondente" };
  }
  const data = /^\d{4}-\d{2}-\d{2}$/.test(nota.data)
    ? ` del ${nota.data.slice(8, 10)}/${nota.data.slice(5, 7)}/${nota.data.slice(0, 4)}`
    : "";
  const dove = nota.fonte === "sdi" ? "nello SDI" : "tra le fatture registrate";
  return {
    esito: "trovata",
    testo: `Trovata ${dove}: n. ${nota.numero || "—"}${data}`,
  };
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

const PROFORMA = /\bpro[\s-]?forma\b/i;
const ITALIANA_SDI =
  /\bfattura\s+elettronica\b|\bcodice\s+destinatario\b|\btrasmess[oa]\s+(?:allo\s+)?sdi\b|\bregime\s+fiscale\b|\bcopia\s+(?:di\s+)?cortesia\b/i;
const FORMA_ITALIANA =
  /\bS\.?\s*r\.?\s*l\.?\b|\bS\.?\s*p\.?\s*a\.?\b|\bS\.?\s*n\.?\s*c\.?\b|\bS\.?\s*a\.?\s*s\.?\b|\bitalia\b|\bitaly\b/i;
const NON_FATTURA =
  /\bconferma\s+spedizione\b|\blettera\s*di\s*vettura\b|\bterms(?:\s+|_)and(?:\s+|_)conditions\b|\bcondizioni\s+generali\b|\bdisposizione\b|\bbonifico\b|\bfatturato\b|\bchallenge\s*test\b|\bcontrollo\s+fattura\b/i;

function paeseCedenteXml(xml: string): string {
  const cedente = xmlBlocks(xml, "CedentePrestatore")[0] ?? "";
  return xmlText(cedente, "IdPaese").trim().toUpperCase();
}

function emailItaliana(email: string): boolean {
  const dominio = email.trim().toLowerCase().split("@")[1] ?? "";
  return dominio.endsWith(".it") || dominio.endsWith("fattureincloud.it");
}

/**
 * Proforma, fatture italiane e mail che non sono una fattura
 * non si propongono. La fattura italiana arriva dallo SDI.
 */
export function motivoEsclusioneMailFattura(input: {
  oggetto?: string;
  mittente?: string;
  emailMittente?: string;
  fileName: string;
  testo?: string;
  xml?: string | null;
  pivaCedente?: string | null;
}): "proforma" | "italiana_sdi" | "non_fattura" | null {
  const nome = input.fileName.trim();
  const presentazione = `${input.oggetto ?? ""}\n${input.mittente ?? ""}\n${nome}`;
  const blob = `${presentazione}\n${input.testo ?? ""}`;
  if (PROFORMA.test(blob)) return "proforma";
  if (NON_FATTURA.test(presentazione) || /letteradivettura|terms_and_conditions/i.test(nome)) {
    return "non_fattura";
  }
  const xml = input.xml ?? "";
  if (/FatturaElettronica/i.test(xml)) {
    const paese = paeseCedenteXml(xml);
    if (!paese || paese === "IT") return "italiana_sdi";
  }
  if (/\.p7m$/i.test(nome) || /IT\d{11}/i.test(nome)) return "italiana_sdi";
  if (ITALIANA_SDI.test(blob)) return "italiana_sdi";
  if (emailItaliana(input.emailMittente ?? "")) return "italiana_sdi";
  if (FORMA_ITALIANA.test(presentazione)) return "italiana_sdi";
  const piva = normalizzaPiva(input.pivaCedente ?? "");
  if (/^IT\d{11}$/.test(piva) || /^\d{11}$/.test(piva)) return "italiana_sdi";
  return null;
}

export function xmlNelFile(bytes: Buffer): string | null {
  const text = bytes.toString("utf8");
  const xml = text.indexOf("<?xml");
  const fat = text.search(/<([A-Za-z0-9]+:)?FatturaElettronica/i);
  const start = xml >= 0 ? xml : fat;
  if (start < 0) return null;
  return text.slice(start);
}
