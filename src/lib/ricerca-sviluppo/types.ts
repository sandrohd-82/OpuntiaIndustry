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

export const createRicercaSchema = z.object({
  tipo: rsTipoSchema,
  titolo: z
    .string()
    .trim()
    .min(1, "Titolo obbligatorio")
    .max(200, "Max 200 caratteri"),
  descrizione: z.string().trim().max(5000).optional().default(""),
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
};

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

export function mapRicerca(row: {
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
}): RsRicerca {
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
