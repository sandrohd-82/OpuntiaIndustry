import { z } from "zod";

const nome = z.string().trim().min(1, "Indica il nome del sito.").max(160);
const url = z.string().trim().min(1, "Indica l'URL.").max(500);
const mail = z.string().trim().min(1, "Indica la mail di accesso.").max(200);

export const caveauSitoSchema = z.object({
  nome,
  url,
  mail,
  password: z.string().min(1, "Indica la password.").max(500),
});

export const caveauSitoUpdateSchema = z.object({
  id: z.string().uuid(),
  nome,
  url,
  mail,
  password: z.string().max(500).optional(),
});

export const caveauRivelaSchema = z.object({
  id: z.string().uuid(),
  codice: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Inserisci il codice di 6 cifre ricevuto per email."),
});

export const caveauEliminaSchema = z.object({
  id: z.string().uuid(),
  conferma: z.string().trim().min(1),
});

export const CAVEAU_URL_MAX = 2000;

const acquistoUrl = z
  .string()
  .trim()
  .min(1, "Indica l'URL.")
  .max(CAVEAU_URL_MAX, "L'URL è troppo lungo.");
const acquistoTitolo = z
  .string()
  .trim()
  .min(1, "Indica il titolo.")
  .max(200, "Il titolo è troppo lungo.");

export const caveauAcquistoSchema = z.object({
  sitoId: z.string().trim().uuid("Sito non valido."),
  url: acquistoUrl,
  titolo: acquistoTitolo,
  descrizione: z
    .string()
    .trim()
    .max(4000, "La descrizione è troppo lunga.")
    .optional()
    .default(""),
  prezzo: z.string().trim().max(20, "Il prezzo è troppo lungo.").optional().default(""),
  unitaMisura: z
    .string()
    .trim()
    .max(12, "L'unità è troppo lunga.")
    .optional()
    .default(""),
  registratoAt: z.string().trim().max(64, "Data non valida.").optional().default(""),
});

const CAMPI_ACQUISTO: Record<string, string> = {
  id: "Acquisto",
  sitoId: "Sito",
  url: "URL",
  titolo: "Titolo",
  descrizione: "Descrizione",
  prezzo: "Prezzo",
  unitaMisura: "Unità",
  registratoAt: "Data",
};

/** Evita il messaggio inglese di Zod («Invalid input») e indica il campo. */
export function messaggioValidazioneCaveau(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Dati non validi.";
  const testo = issue.message.trim();
  if (testo && !/^invalid\b/i.test(testo)) return testo;
  const campo = CAMPI_ACQUISTO[String(issue.path[0] ?? "")];
  return campo ? `Controlla il campo ${campo}.` : "Dati non validi.";
}

function testoAcquisto(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Il modulo arriva sempre come testo, anche se un campo è vuoto o numerico. */
export function normalizzaInputAcquisto(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const raw = input as Record<string, unknown>;
  const out: Record<string, string> = {
    sitoId: testoAcquisto(raw.sitoId),
    url: testoAcquisto(raw.url),
    titolo: testoAcquisto(raw.titolo),
    descrizione: testoAcquisto(raw.descrizione),
    prezzo: testoAcquisto(raw.prezzo),
    unitaMisura: testoAcquisto(raw.unitaMisura ?? raw.unita),
    registratoAt: testoAcquisto(raw.registratoAt),
  };
  if (typeof raw.id === "string") out.id = raw.id;
  return out;
}

export const CAVEAU_UNITA_BASE = [
  "un",
  "nr",
  "pz",
  "kg",
  "g",
  "lt",
  "ml",
  "mt",
  "cm",
  "m",
] as const;

export const caveauUnitaSchema = z.object({
  sigla: z.string().trim().min(1, "Indica la sigla.").max(12),
});

/** Chiave di confronto: ignora protocollo, www e slash finale. Null se non è un indirizzo web. */
export function chiaveUrlCaveau(raw: string): string | null {
  const testo = raw.trim();
  if (!testo || testo.length > CAVEAU_URL_MAX) return null;
  const conProtocollo = /^[a-z][a-z0-9+.-]*:\/\//i.test(testo)
    ? testo
    : `https://${testo}`;
  let parsed: URL;
  try {
    parsed = new URL(conProtocollo);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host || host.includes(" ") || !host.includes(".")) return null;
  let path = parsed.pathname;
  try {
    path = decodeURI(path);
  } catch {
    path = parsed.pathname;
  }
  path = path.replace(/\/+$/, "");
  return `${host}${path}${parsed.search}`.toLowerCase();
}

export function urlCaveauAccettabile(
  raw: string
): { ok: true; url: string; chiave: string } | { ok: false; error: string } {
  const url = raw.trim();
  const chiave = chiaveUrlCaveau(url);
  if (!chiave) {
    return {
      ok: false,
      error:
        "URL non valido. Indica un indirizzo web, per esempio https://esempio.it/pagina.",
    };
  }
  return { ok: true, url, chiave };
}

export function normalizzaUnita(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: true, value: "" };
  if (!/^[a-z0-9]{1,12}$/.test(value)) {
    return { ok: false, error: "L'unità è una sigla breve, per esempio mt o lt." };
  }
  return { ok: true, value };
}

export const caveauAcquistoUpdateSchema = caveauAcquistoSchema.extend({
  id: z.string().trim().uuid("Acquisto non valido."),
});

export function prezzoAcquistoOrNull(
  raw: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const testo = raw.trim().replace(",", ".");
  if (!testo) return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(testo)) {
    return { ok: false, error: "Il prezzo è un importo in euro, anche vuoto." };
  }
  const n = Number(testo);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Il prezzo non può essere negativo." };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export function registratoAtOrNull(
  raw: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  const testo = raw.trim();
  if (!testo) return { ok: true, value: null };
  const data = new Date(testo);
  if (Number.isNaN(data.getTime())) {
    return { ok: false, error: "Data non valida." };
  }
  return { ok: true, value: data.toISOString() };
}

export const CAVEAU_DOCUMENTO_BUCKET = "caveau-siti-documenti";
export const CAVEAU_DOCUMENTO_MAX_BYTES = 15 * 1024 * 1024;

const MIME_DA_ESTENSIONE: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function mimeDocumentoCaveau(
  fileName: string,
  fileType: string
): string | null {
  const dichiarato = fileType.trim().toLowerCase();
  const ext = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  const daEstensione = MIME_DA_ESTENSIONE[ext] ?? "";
  if (dichiarato && Object.values(MIME_DA_ESTENSIONE).includes(dichiarato)) {
    return dichiarato;
  }
  return daEstensione || null;
}

export type CaveauAcquistoDocumento = {
  id: string;
  nome: string;
  fileName: string;
  fileSize: number;
};

export type CaveauAcquistoRiga = {
  id: string;
  sitoId: string;
  url: string;
  titolo: string;
  descrizione: string;
  prezzo: number | null;
  unitaMisura: string;
  registratoAt: string | null;
  versione: number;
  documenti: CaveauAcquistoDocumento[];
};

export type CaveauSitoRiga = {
  id: string;
  nome: string;
  url: string;
  mail: string;
  versione: number;
  updatedAt: string;
  acquisti: CaveauAcquistoRiga[];
};
