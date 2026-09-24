import { z } from "zod";
import { ACTION_ESSICCATORE_IDS } from "@/lib/action/essiccatori";
import type { DocumentoStatoCatalogo } from "@/lib/action/azioni-catalogo";

export const IOT_ATTUATORE_TIPI = [
  "on_off",
  "on_off_temporizzato",
  "inverter",
  "inverter_consenso",
  "setpoint_temperatura",
] as const;
export type IotAttuatoreTipo = (typeof IOT_ATTUATORE_TIPI)[number];

export const IOT_ATTUATORE_LABEL: Record<IotAttuatoreTipo, string> = {
  on_off: "On / Off",
  on_off_temporizzato: "On / Off temporizzato",
  inverter: "Inverter (potenza %)",
  inverter_consenso: "Inverter + consenso On/Off",
  setpoint_temperatura: "Setpoint temperatura",
};

export const IOT_CANALE_RUOLI = ["attuatore", "regolatore", "sensore"] as const;
export type IotCanaleRuolo = (typeof IOT_CANALE_RUOLI)[number];

export const IOT_CANALE_RUOLO_LABEL: Record<IotCanaleRuolo, string> = {
  attuatore: "Attuatore",
  regolatore: "Regolatore",
  sensore: "Sensore",
};

export const IOT_MACCHINA_TIPI = ["essiccatore", "altra"] as const;
export type IotMacchinaTipo = (typeof IOT_MACCHINA_TIPI)[number];

export const IOT_MACCHINA_TIPO_LABEL: Record<IotMacchinaTipo, string> = {
  essiccatore: "Essiccatore",
  altra: "Altra macchina",
};

export const IOT_LINK_RUOLI = ["feedback", "precondizione", "allarme"] as const;
export type IotLinkRuolo = (typeof IOT_LINK_RUOLI)[number];

export const IOT_LINK_RUOLO_LABEL: Record<IotLinkRuolo, string> = {
  feedback: "Feedback",
  precondizione: "Precondizione",
  allarme: "Allarme",
};

export const IOT_PRECONDIZIONI = [
  "nessuna",
  "chiuso",
  "aperto",
  "spento",
  "acceso",
] as const;
export type IotPrecondizione = (typeof IOT_PRECONDIZIONI)[number];

export const IOT_PRECONDIZIONE_LABEL: Record<IotPrecondizione, string> = {
  nessuna: "Nessuna",
  chiuso: "Solo se chiuso",
  aperto: "Solo se aperto",
  spento: "Solo se spento",
  acceso: "Solo se acceso",
};

const codiceSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9._-]+$/, "Codice: lettere, numeri, . _ -");

export type ActionIotMacchina = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  tipoMacchina: IotMacchinaTipo;
  essiccatoreId: string | null;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
};

export type ActionIotModulo = {
  id: string;
  macchinaId: string;
  codice: string;
  nome: string;
  descrizione: string;
  sortOrder: number;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
};

export type ActionIotComponente = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  ruolo: IotCanaleRuolo;
  tipoAttuatore: IotAttuatoreTipo | null;
  macchinaId: string | null;
  moduloId: string | null;
  macchinaNome: string;
  moduloNome: string;
  essiccatoreId: string | null;
  areaSlug: string;
  richiedeConsenso: boolean;
  valoreMin: number;
  valoreMax: number;
  valoreDefault: number;
  unita: string;
  precondizione: IotPrecondizione;
  mexCmd: number | null;
  durataImpulsoDefaultSec: number | null;
  impostazioni: Record<string, unknown>;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
  createdAt: string;
};

export type ActionIotSensoreCollegamento = {
  id: string;
  sensoreId: string;
  canaleId: string;
  ruoloLink: IotLinkRuolo;
  note: string;
  sensoreNome: string;
  canaleNome: string;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
};

export type ActionIotAlberoModulo = ActionIotModulo & {
  canali: ActionIotComponente[];
};

export type ActionIotAlberoMacchina = ActionIotMacchina & {
  moduli: ActionIotAlberoModulo[];
  sensoriMacchina: ActionIotComponente[];
};

export type ActionIotAlbero = {
  macchine: ActionIotAlberoMacchina[];
  collegamenti: ActionIotSensoreCollegamento[];
};

export function attuatoreHaOnOff(tipo: IotAttuatoreTipo | null | undefined): boolean {
  return (
    tipo === "on_off" ||
    tipo === "on_off_temporizzato" ||
    tipo === "inverter_consenso"
  );
}

export function attuatoreHaValore(tipo: IotAttuatoreTipo | null | undefined): boolean {
  return (
    tipo === "inverter" ||
    tipo === "inverter_consenso" ||
    tipo === "setpoint_temperatura"
  );
}

export function attuatoreHaDurataComando(
  tipo: IotAttuatoreTipo | null | undefined
): boolean {
  return tipo === "on_off_temporizzato";
}

export function labelTipoCanale(c: {
  ruolo: IotCanaleRuolo;
  tipoAttuatore: IotAttuatoreTipo | null;
}): string {
  if (c.ruolo === "sensore") return "Sensore";
  if (c.tipoAttuatore) return IOT_ATTUATORE_LABEL[c.tipoAttuatore];
  return IOT_CANALE_RUOLO_LABEL[c.ruolo];
}

export function labelCanaleSequenza(c: ActionIotComponente): string {
  const tipo = labelTipoCanale(c);
  return c.moduloNome ? `${c.moduloNome} · ${c.nome} · ${tipo}` : `${c.nome} · ${tipo}`;
}

export function canaleEAzione(c: Pick<ActionIotComponente, "ruolo">): boolean {
  return c.ruolo === "attuatore" || c.ruolo === "regolatore";
}

function unitaIsCelsius(unita: string): boolean {
  const u = unita.normalize("NFKD").toLowerCase();
  return (u.includes("c") || u.includes("°")) && !u.includes("%");
}

/** Setpoint bruciatore: temperatura, non potenza ventola. Mex CMD 2 = BURNER_TEMP. */
export function canaleETemperatura(
  c: Pick<ActionIotComponente, "tipoAttuatore" | "unita" | "mexCmd">
): boolean {
  if (c.tipoAttuatore === "setpoint_temperatura") return true;
  if (c.mexCmd === 2) return true;
  return unitaIsCelsius(c.unita ?? "");
}

export function canaleEAperturaBruciatore(
  c: Pick<ActionIotComponente, "tipoAttuatore" | "unita" | "mexCmd" | "moduloNome" | "nome">
): boolean {
  if (canaleETemperatura(c)) return false;
  if (c.mexCmd === 5) return true;
  const ctx = `${c.moduloNome} ${c.nome}`.toLowerCase();
  return ctx.includes("bruc");
}

export type IotGaugeKind = "temperatura" | "apertura_bruciatore" | "ventilazione";

export function gaugeKindForCanale(
  c: Pick<
    ActionIotComponente,
    "tipoAttuatore" | "unita" | "mexCmd" | "moduloNome" | "nome"
  >
): IotGaugeKind {
  if (canaleETemperatura(c)) return "temperatura";
  if (canaleEAperturaBruciatore(c)) return "apertura_bruciatore";
  return "ventilazione";
}

export const macchinaInputSchema = z.object({
  id: z.string().uuid().optional(),
  codice: codiceSchema,
  nome: z.string().trim().min(2).max(120),
  descrizione: z.string().trim().max(2000).optional().default(""),
  tipoMacchina: z.enum(IOT_MACCHINA_TIPI).optional().default("essiccatore"),
  essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS).nullable().optional(),
});

export const moduloInputSchema = z.object({
  id: z.string().uuid().optional(),
  macchinaId: z.string().uuid(),
  codice: codiceSchema,
  nome: z.string().trim().min(2).max(120),
  descrizione: z.string().trim().max(2000).optional().default(""),
  sortOrder: z.number().int().min(0).max(999).optional().default(0),
});

export const componenteInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    codice: codiceSchema,
    nome: z.string().trim().min(2).max(120),
    descrizione: z.string().trim().max(2000).optional().default(""),
    ruolo: z.enum(IOT_CANALE_RUOLI),
    tipoAttuatore: z.enum(IOT_ATTUATORE_TIPI).nullable().optional(),
    macchinaId: z.string().uuid(),
    moduloId: z.string().uuid().nullable().optional(),
    essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS).nullable().optional(),
    areaSlug: z.string().trim().max(40).optional().default("essiccatori"),
    richiedeConsenso: z.boolean().optional().default(false),
    valoreMin: z.number().optional(),
    valoreMax: z.number().optional(),
    valoreDefault: z.number().optional(),
    unita: z.string().trim().max(12).optional().default(""),
    precondizione: z.enum(IOT_PRECONDIZIONI).optional().default("nessuna"),
    mexCmd: z.number().int().min(0).max(255).nullable().optional(),
    durataImpulsoDefaultSec: z
      .number()
      .int()
      .min(1)
      .max(86400)
      .nullable()
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.ruolo === "sensore") {
      if (v.tipoAttuatore) {
        ctx.addIssue({
          code: "custom",
          path: ["tipoAttuatore"],
          message: "Un sensore non ha tipo attuatore.",
        });
      }
      return;
    }
    if (!v.moduloId) {
      ctx.addIssue({
        code: "custom",
        path: ["moduloId"],
        message: "Attuatore e regolatore stanno sotto un componente.",
      });
    }
    if (!v.tipoAttuatore) {
      ctx.addIssue({
        code: "custom",
        path: ["tipoAttuatore"],
        message: "Scegli il tipo attuatore o regolatore.",
      });
    }
  });

export const collegamentoInputSchema = z.object({
  id: z.string().uuid().optional(),
  sensoreId: z.string().uuid(),
  canaleId: z.string().uuid(),
  ruoloLink: z.enum(IOT_LINK_RUOLI).optional().default("feedback"),
  note: z.string().trim().max(500).optional().default(""),
});

export function defaultRangeForTipo(tipo: IotAttuatoreTipo): {
  min: number;
  max: number;
  def: number;
  unita: string;
} {
  switch (tipo) {
    case "setpoint_temperatura":
      return { min: 35, max: 70, def: 50, unita: "°C" };
    case "inverter":
    case "inverter_consenso":
      return { min: 0, max: 100, def: 70, unita: "%" };
    default:
      return { min: 0, max: 1, def: 0, unita: "" };
  }
}

export function buildIotAlbero(
  macchine: ActionIotMacchina[],
  moduli: ActionIotModulo[],
  canali: ActionIotComponente[],
  collegamenti: ActionIotSensoreCollegamento[]
): ActionIotAlbero {
  const moduliByMac = new Map<string, ActionIotModulo[]>();
  for (const mo of moduli) {
    const list = moduliByMac.get(mo.macchinaId) ?? [];
    list.push(mo);
    moduliByMac.set(mo.macchinaId, list);
  }
  const canaliByMod = new Map<string, ActionIotComponente[]>();
  const sensoriByMac = new Map<string, ActionIotComponente[]>();
  for (const c of canali) {
    if (c.ruolo === "sensore" && !c.moduloId && c.macchinaId) {
      const list = sensoriByMac.get(c.macchinaId) ?? [];
      list.push(c);
      sensoriByMac.set(c.macchinaId, list);
      continue;
    }
    if (c.moduloId) {
      const list = canaliByMod.get(c.moduloId) ?? [];
      list.push(c);
      canaliByMod.set(c.moduloId, list);
    }
  }
  const ruoloOrd: Record<IotCanaleRuolo, number> = {
    attuatore: 0,
    regolatore: 1,
    sensore: 2,
  };
  const sortCanali = (a: ActionIotComponente, b: ActionIotComponente) =>
    ruoloOrd[a.ruolo] - ruoloOrd[b.ruolo] || a.nome.localeCompare(b.nome, "it");

  return {
    macchine: macchine.map((m) => ({
      ...m,
      moduli: (moduliByMac.get(m.id) ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.nome.localeCompare(b.nome, "it"))
        .map((mo) => ({
          ...mo,
          canali: (canaliByMod.get(mo.id) ?? []).slice().sort(sortCanali),
        })),
      sensoriMacchina: (sensoriByMac.get(m.id) ?? [])
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    })),
    collegamenti,
  };
}
