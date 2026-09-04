import { z } from "zod";

export const IOT_STATI = ["no_iot", "acceso", "arresto", "spento"] as const;
export type IotStato = (typeof IOT_STATI)[number];

export const MACCHINARIO_TIPI = ["macchina", "insieme"] as const;
export type MacchinarioTipo = (typeof MACCHINARIO_TIPI)[number];

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
  parentId: string | null;
  tipo: MacchinarioTipo;
  figli?: ProduzioneMacchinario[];
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

export function isInsieme(m: ProduzioneMacchinario): boolean {
  return m.tipo === "insieme" || m.codice === "vasca-lavaggio";
}

export const VASCA_FIGLI_CODICI = [
  "pompa-in-disinfettante",
  "soffiante",
  "nastro-risalita",
  "spruzzini",
] as const;

export function insiemeDerivedStato(figli: ProduzioneMacchinario[]): IotStato {
  if (!figli.length) return "spento";
  if (figli.some((f) => f.statoIot === "arresto")) return "arresto";
  if (figli.every((f) => f.statoIot === "acceso")) return "acceso";
  return "spento";
}

export function nestMacchinari(
  items: ProduzioneMacchinario[]
): ProduzioneMacchinario[] {
  const byId = new Map(items.map((m) => [m.id, { ...m, figli: [] as ProduzioneMacchinario[] }]));
  const vasca = [...byId.values()].find((m) => m.codice === "vasca-lavaggio");
  const roots: ProduzioneMacchinario[] = [];
  for (const m of byId.values()) {
    const parentId =
      m.parentId && byId.has(m.parentId)
        ? m.parentId
        : vasca &&
            VASCA_FIGLI_CODICI.includes(
              m.codice as (typeof VASCA_FIGLI_CODICI)[number]
            )
          ? vasca.id
          : null;
    if (parentId && parentId !== m.id && byId.has(parentId)) {
      byId.get(parentId)!.figli!.push(m);
    } else {
      roots.push(m);
    }
  }
  for (const m of byId.values()) {
    m.figli?.sort((a, b) => a.sortOrder - b.sortOrder || a.nome.localeCompare(b.nome));
    if (m.tipo === "insieme") {
      m.statoIot = insiemeDerivedStato(m.figli ?? []);
    }
  }
  roots.sort((a, b) => a.sortOrder - b.sortOrder || a.nome.localeCompare(b.nome));
  return roots;
}

export function foglieMacchinari(
  items: ProduzioneMacchinario[]
): ProduzioneMacchinario[] {
  return items.filter((m) => m.tipo !== "insieme");
}

export function applyMacchinaPatch(
  items: ProduzioneMacchinario[],
  item: ProduzioneMacchinario
): ProduzioneMacchinario[] {
  const byId = new Map(items.map((m) => [m.id, m]));
  byId.set(item.id, { ...byId.get(item.id), ...item });
  for (const f of item.figli ?? []) {
    byId.set(f.id, { ...byId.get(f.id), ...f });
  }
  const next = [...byId.values()];
  return next.map((m) => {
    if (m.tipo !== "insieme") return m;
    const figli = next.filter((x) => x.parentId === m.id);
    return { ...m, statoIot: insiemeDerivedStato(figli) };
  });
}

export const ATTIVITA_AZIONI = ["on", "off"] as const;
export type AttivitaAzione = (typeof ATTIVITA_AZIONI)[number];

export const ATTIVITA_ORIGINI = [
  "panoramica",
  "scheda",
  "evento_linea",
  "iot",
  "insieme",
] as const;
export type AttivitaOrigine = (typeof ATTIVITA_ORIGINI)[number];

export function attivitaOrigineLabel(origine: AttivitaOrigine): string {
  if (origine === "panoramica") return "Panoramica";
  if (origine === "scheda") return "Scheda macchina";
  if (origine === "evento_linea") return "Evento di linea";
  if (origine === "insieme") return "Insieme";
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
export type EventoLineaTipo = string;

export function eventoLineaLabel(tipo: string): string {
  if (tipo === "pausa_caffe") return "Pausa caffè";
  if (tipo === "pausa_pranzo") return "Pausa pranzo";
  if (tipo === "fine_turno") return "Fine turno";
  if (tipo === "ripresa") return "Ripresa";
  return tipo;
}

export const EVENTO_STATI_OBIETTIVO = ["off", "on", "nessuno"] as const;
export type EventoStatoObiettivo = (typeof EVENTO_STATI_OBIETTIVO)[number];

export function eventoStatoObiettivoLabel(stato: EventoStatoObiettivo): string {
  if (stato === "off") return "Passaggio in Off";
  if (stato === "on") return "Passaggio in On";
  return "Nessuna variazione";
}

export type EventoMacchinaStato = "off" | "on";

export type EventoLineaMacchinaConfig = {
  macchinarioId: string;
  statoObiettivo: EventoMacchinaStato;
};

export type EventoLineaCatalogo = {
  id: string;
  codice: string;
  nome: string;
  sintesi: string;
  dettagli: string;
  richiedeSpegnimento: boolean;
  durataMinuti: number;
  statoObiettivo: EventoStatoObiettivo;
  macchineIds: string[];
  macchine: EventoLineaMacchinaConfig[];
  sortOrder: number;
  documentoStato: "bozza" | "approvato";
  versione: number;
  attivo: boolean;
};

export const eventoLineaCatalogoInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome obbligatorio").max(120),
  sintesi: z.string().trim().min(1, "Sintesi obbligatoria").max(240),
  durataMinuti: z.number().int().min(0).max(24 * 60).optional().default(0),
  statoObiettivo: z.enum(EVENTO_STATI_OBIETTIVO).optional().default("off"),
});

export const eventoLineaCatalogoSettingsSchema = z.object({
  catalogoId: z.string().uuid(),
  areaId: z.string().uuid(),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(120),
  sintesi: z.string().trim().min(1, "Sintesi obbligatoria").max(240),
  durataMinuti: z.number().int().min(0).max(24 * 60),
  statoObiettivo: z.enum(EVENTO_STATI_OBIETTIVO),
  macchine: z.array(
    z.object({
      macchinarioId: z.string().uuid(),
      statoObiettivo: z.enum(["off", "on"]),
    })
  ),
});

export const eventoLineaCatalogoDeleteSchema = z.object({
  catalogoId: z.string().uuid(),
  confermaTestuale: z.string().trim().min(1),
});

export const eventoLineaCatalogoReorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

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
  statoObiettivo: EventoMacchinaStato;
};

export type EventoLinea = {
  id: string;
  areaId: string;
  tipo: EventoLineaTipo;
  tipoNome: string;
  catalogoId: string | null;
  richiedeSpegnimento: boolean;
  durataMinuti: number;
  statoObiettivo: EventoStatoObiettivo;
  documentoStato: "bozza" | "in_corso" | "chiuso";
  note: string;
  startedAt: string;
  startedByNome: string;
  closedAt: string | null;
  macchine: EventoLineaMacchina[];
};
