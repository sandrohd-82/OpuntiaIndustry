import { z } from "zod";

export const rsTipoSchema = z.enum(["processo", "materia_prima"]);
export type RsTipo = z.infer<typeof rsTipoSchema>;

export const rsStatoSchema = z.enum([
  "bozza",
  "in_corso",
  "approvato",
  "archiviato",
]);
export type RsStato = z.infer<typeof rsStatoSchema>;

export const rsReportStatoSchema = z.enum(["bozza", "confermato", "chiuso"]);
export type RsReportStato = z.infer<typeof rsReportStatoSchema>;

export const soggettoModoSchema = z.enum([
  "catalogo",
  "libero",
  "nuovo",
  "nessuno",
]);
export type RsSoggettoModo = z.infer<typeof soggettoModoSchema>;

export const rsColoreSchema = z.enum(["verde", "giallo", "rosso"]);
export type RsColore = z.infer<typeof rsColoreSchema>;

export const rsBersaglioSchema = z.enum(["nota", "voce", "testo"]);
export type RsBersaglio = z.infer<typeof rsBersaglioSchema>;

export const rsVoceTipoSchema = z.enum(["elenco", "checklist"]);
export type RsVoceTipo = z.infer<typeof rsVoceTipoSchema>;

export const createRicercaSchema = z
  .object({
    tipo: rsTipoSchema,
    tipoVoceId: z.string().uuid("Scegli il tipo di ricerca"),
    soggettoModo: z.enum(["catalogo", "libero", "nuovo"]),
    prodottoProprioId: z.string().uuid().nullable().optional(),
    soggettoLibero: z.string().trim().max(200).optional().default(""),
    titolo: z
      .string()
      .trim()
      .min(1, "Titolo obbligatorio")
      .max(200, "Max 200 caratteri"),
    descrizione: z.string().trim().max(5000).optional().default(""),
    versione: z.number().int().min(1).max(999),
    dataInizioPresunta: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data presunta di inizio obbligatoria"),
  })
  .superRefine((val, ctx) => {
    if (val.soggettoModo === "catalogo" && !val.prodottoProprioId) {
      ctx.addIssue({
        code: "custom",
        message: "Scegli un prodotto dal catalogo.",
        path: ["prodottoProprioId"],
      });
    }
    if (val.soggettoModo !== "catalogo" && !val.soggettoLibero.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Scrivi la voce del soggetto.",
        path: ["soggettoLibero"],
      });
    }
  });

export type RsRicerca = {
  id: string;
  tipo: RsTipo;
  titolo: string;
  descrizione: string;
  stato: RsStato;
  versione: number;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  tipoVoceId: string | null;
  tipoVoceNome: string | null;
  soggettoModo: RsSoggettoModo;
  soggettoLibero: string;
  prodottoProprioId: string | null;
  prodottoEtichetta: string | null;
  dataInizioPresunta: string | null;
};

export type RsTipoVoce = {
  id: string;
  ambito: RsTipo;
  nome: string;
};

export type RsProdottoScelta = {
  id: string;
  codice: string;
  nome: string;
};

export type RsNotaVoce = {
  id: string;
  tipo: RsVoceTipo;
  testo: string;
  fatto: boolean;
  sortOrder: number;
};

export type RsNotaEsito = {
  id: string;
  bersaglio: RsBersaglio;
  voceId: string | null;
  estrattoTesto: string;
  colore: RsColore;
  problema: string;
  modificaPrevista: string;
};

export type RsTimelineNota = {
  id: string;
  occurredAt: string;
  numero: number;
  suffisso: string | null;
  bodyText: string;
  versione: number;
  voci: RsNotaVoce[];
  esiti: RsNotaEsito[];
};

export function etichettaSequenzaNota(
  numero: number,
  suffisso: string | null
): string {
  return suffisso ? `${numero}-${suffisso}` : String(numero);
}

export function confrontaNote(
  a: { numero: number; suffisso: string | null },
  b: { numero: number; suffisso: string | null }
): number {
  if (a.numero !== b.numero) return a.numero - b.numero;
  if (!a.suffisso && b.suffisso) return -1;
  if (a.suffisso && !b.suffisso) return 1;
  return (a.suffisso ?? "").localeCompare(b.suffisso ?? "");
}

export type RsAllegatoKind =
  | "file"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "doc";

export type RsAllegato = {
  id: string;
  reportId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  kind: RsAllegatoKind;
  sizeBytes: number;
  includeInPrint: boolean;
  createdAt: string;
  signedUrl?: string | null;
};

export type RsMention = {
  id: string;
  userId: string;
  name?: string;
};

export type RsChatLink = {
  id: string;
  linkKind: "conversation" | "topic";
  linkId: string;
  label: string;
};

export type RsLink = {
  id: string;
  kind: "url" | "maps";
  url: string;
  label: string;
  placeText: string;
};

export type RsReport = {
  id: string;
  ricercaId: string;
  reportDate: string;
  bodyText: string;
  stato: RsReportStato;
  versione: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  mentions: RsMention[];
  chatLinks: RsChatLink[];
  links: RsLink[];
  allegati: RsAllegato[];
};

export function mapRicerca(
  row: {
    id: string;
    tipo: string;
    titolo: string;
    descrizione: string | null;
    stato: string;
    versione: number;
    approved_at: string | null;
    approved_by: string | null;
    created_at: string;
    updated_at: string;
    created_by: string | null;
    tipo_voce_id?: string | null;
    soggetto_modo?: string | null;
    soggetto_libero?: string | null;
    prodotto_proprio_id?: string | null;
    data_inizio_presunta?: string | null;
  },
  nomi?: {
    tipoVoceNome?: string | null;
    prodottoEtichetta?: string | null;
  }
): RsRicerca {
  const modo = row.soggetto_modo ?? "nessuno";
  return {
    id: row.id,
    tipo: row.tipo as RsTipo,
    titolo: row.titolo,
    descrizione: row.descrizione ?? "",
    stato: row.stato as RsStato,
    versione: row.versione,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    tipoVoceId: row.tipo_voce_id ?? null,
    tipoVoceNome: nomi?.tipoVoceNome ?? null,
    soggettoModo: soggettoModoSchema.safeParse(modo).success
      ? (modo as RsSoggettoModo)
      : "nessuno",
    soggettoLibero: row.soggetto_libero ?? "",
    prodottoProprioId: row.prodotto_proprio_id ?? null,
    prodottoEtichetta: nomi?.prodottoEtichetta ?? null,
    dataInizioPresunta: row.data_inizio_presunta ?? null,
  };
}

export function allegatoKindFromMime(mime: string, name: string): RsAllegatoKind {
  const m = mime.toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (
    m.includes("word") ||
    m.includes("document") ||
    n.endsWith(".doc") ||
    n.endsWith(".docx")
  ) {
    return "doc";
  }
  return "file";
}

export function isPrintableAllegatoKind(kind: RsAllegatoKind): boolean {
  return kind !== "video" && kind !== "audio";
}

export function parseMentionIds(
  body: string,
  peers: { id: string; name: string }[]
): string[] {
  const ids = new Set<string>();
  const re = /@([^\s@]+(?:\s+[^\s@]+)?)/g;
  let m: RegExpExecArray | null;
  const lowerPeers = peers.map((p) => ({
    id: p.id,
    name: p.name.trim().toLowerCase(),
  }));
  while ((m = re.exec(body)) !== null) {
    const token = (m[1] ?? "").trim().toLowerCase();
    if (!token) continue;
    const hit =
      lowerPeers.find((p) => p.name === token) ||
      lowerPeers.find((p) => p.name.startsWith(token)) ||
      lowerPeers.find((p) => p.name.split(/\s+/)[0] === token);
    if (hit) ids.add(hit.id);
  }
  return [...ids];
}
