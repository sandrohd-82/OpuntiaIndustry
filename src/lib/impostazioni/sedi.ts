import { z } from "zod";

export const SEDI_TIPI = [
  "amministrativa",
  "produttiva",
  "magazzino",
  "terreno_agricolo",
  "legale",
] as const;

export type SedeTipo = (typeof SEDI_TIPI)[number];

export const SEDI_TIPO_LABEL: Record<SedeTipo, string> = {
  amministrativa: "Amministrativa",
  produttiva: "Produttiva",
  magazzino: "Magazzino",
  terreno_agricolo: "Terreno Agricolo",
  legale: "Legale",
};

export type ImpostazioniSede = {
  id: string;
  codice: string;
  nome: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  nazione: string;
  descrizione: string;
  tipoSede: SedeTipo;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  attiva: boolean;
};

export function parseSedeTipo(raw: unknown): SedeTipo {
  const v = String(raw ?? "amministrativa");
  return (SEDI_TIPI as readonly string[]).includes(v)
    ? (v as SedeTipo)
    : "amministrativa";
}

export function labelSede(
  s: Pick<ImpostazioniSede, "nome" | "citta" | "indirizzo"> & {
    tipoSede?: SedeTipo;
  }
): string {
  const extra = [
    s.tipoSede ? SEDI_TIPO_LABEL[s.tipoSede] : "",
    s.citta,
    s.indirizzo,
  ]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
  return extra.length ? `${s.nome} · ${extra.join(" · ")}` : s.nome;
}

export const sedeUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2, "Nome obbligatorio").max(160),
  indirizzo: z.string().trim().min(1, "Indirizzo obbligatorio (Maps)").max(500),
  descrizione: z.string().trim().max(2000).optional().default(""),
  tipoSede: z.enum(SEDI_TIPI),
  mapsUrl: z.string().trim().max(1000).optional().default(""),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  citta: z.string().trim().max(120).optional().default(""),
  cap: z.string().trim().max(16).optional().default(""),
  provincia: z.string().trim().max(80).optional().default(""),
  nazione: z.string().trim().max(80).optional().default("Italia"),
  attiva: z.boolean().optional().default(true),
});

export type SedeUpsertInput = z.infer<typeof sedeUpsertSchema>;
