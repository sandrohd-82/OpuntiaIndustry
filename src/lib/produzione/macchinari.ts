import { z } from "zod";

export const IOT_STATI = ["no_iot", "acceso", "arresto", "spento"] as const;
export type IotStato = (typeof IOT_STATI)[number];

export type ProduzioneMacchinario = {
  id: string;
  areaId: string;
  codice: string;
  nome: string;
  descrizione: string;
  iotCollegato: boolean;
  statoIot: IotStato;
  statoNote: string;
  statoAt: string | null;
  attivo: boolean;
  sortOrder: number;
  note: string;
};

export type MacchinarioRicambio = {
  id: string;
  macchinarioId: string;
  articolo: string;
  nomeDettaglio: string;
  aziendaVenditrice: string;
  presente: boolean;
  scaffale: string;
  quantita: number;
  unita: string;
  sogliaMinima: number;
  note: string;
};

export const macchinarioInputSchema = z.object({
  areaId: z.string().uuid(),
  codice: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, "Usa lettere, numeri e trattini"),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(120),
  descrizione: z.string().trim().max(500).optional().default(""),
  iotCollegato: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional(),
  note: z.string().trim().max(2000).optional().default(""),
});

export const macchinarioStatoSchema = z.object({
  iotCollegato: z.boolean(),
  statoIot: z.enum(IOT_STATI),
  statoNote: z.string().trim().max(2000).optional().default(""),
});

export const ricambioInputSchema = z.object({
  macchinarioId: z.string().uuid(),
  articolo: z.string().trim().min(1, "Articolo obbligatorio").max(80),
  nomeDettaglio: z.string().trim().min(1, "Nome dettaglio obbligatorio").max(200),
  aziendaVenditrice: z.string().trim().max(200).optional().default(""),
  presente: z.boolean(),
  scaffale: z.string().trim().max(80).optional().default(""),
  quantita: z.number().int().min(0),
  unita: z.string().trim().max(20).optional().default("pz"),
  sogliaMinima: z.number().int().min(0).optional().default(0),
  note: z.string().trim().max(2000).optional().default(""),
});

export function iotDotClass(stato: IotStato): string {
  if (stato === "acceso") return "bg-emerald-500";
  if (stato === "arresto") return "bg-red-600";
  if (stato === "spento") return "bg-slate-400";
  return "bg-black";
}

export function iotStatoLabel(stato: IotStato): string {
  if (stato === "acceso") return "Acceso";
  if (stato === "arresto") return "Arresto per problema";
  if (stato === "spento") return "Spento";
  return "No IoT";
}

export function normalizeIotStato(iotCollegato: boolean, stato: IotStato): IotStato {
  if (iotCollegato && stato === "no_iot") return "spento";
  return stato;
}

export function ricambioSottoSoglia(r: MacchinarioRicambio): boolean {
  return r.presente && r.sogliaMinima > 0 && r.quantita < r.sogliaMinima;
}

export function macchinaIsOn(stato: IotStato): boolean {
  return stato === "acceso";
}

export const ATTIVITA_AZIONI = ["on", "off"] as const;
export type AttivitaAzione = (typeof ATTIVITA_AZIONI)[number];

export const ATTIVITA_ORIGINI = [
  "panoramica",
  "scheda",
  "evento_linea",
  "iot",
] as const;
export type AttivitaOrigine = (typeof ATTIVITA_ORIGINI)[number];

export function attivitaOrigineLabel(origine: AttivitaOrigine): string {
  if (origine === "panoramica") return "Panoramica";
  if (origine === "scheda") return "Scheda macchina";
  if (origine === "evento_linea") return "Evento di linea";
  return "IoT";
}

export type MacchinarioAttivita = {
  id: string;
  macchinarioId: string;
  azione: AttivitaAzione;
  origine: AttivitaOrigine;
  actorNome: string;
  note: string;
  createdAt: string;
};

export const EVENTO_LINEA_TIPI = [
  "pausa_caffe",
  "pausa_pranzo",
  "fine_turno",
  "ripresa",
] as const;
export type EventoLineaTipo = (typeof EVENTO_LINEA_TIPI)[number];

export function eventoLineaLabel(tipo: EventoLineaTipo): string {
  if (tipo === "pausa_caffe") return "Pausa caffè";
  if (tipo === "pausa_pranzo") return "Pausa pranzo";
  if (tipo === "fine_turno") return "Fine turno";
  return "Ripresa";
}

export type EventoLineaMacchina = {
  id: string;
  macchinarioId: string;
  nome: string;
  codice: string;
  iotCollegato: boolean;
  statoIot: IotStato;
  richiesto: boolean;
  confermatoAt: string | null;
  viaIot: boolean;
};

export type EventoLinea = {
  id: string;
  areaId: string;
  tipo: EventoLineaTipo;
  documentoStato: "bozza" | "in_corso" | "chiuso";
  note: string;
  startedAt: string;
  startedByNome: string;
  closedAt: string | null;
  macchine: EventoLineaMacchina[];
};
