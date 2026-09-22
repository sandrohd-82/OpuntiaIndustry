import { z } from "zod";
import {
  ACTION_ESSICCATORI,
  ACTION_ESSICCATORE_IDS,
} from "@/lib/action/essiccatori";

/** Contratti macchina: pochi tipi nel codice, N per processo. */
export const PROCESSO_EFFETTO_TIPI = [
  "magazzino.consuma",
  "magazzino.produce",
  "essiccatore.carica_cestone",
] as const;

export type ProcessoEffettoTipo = (typeof PROCESSO_EFFETTO_TIPI)[number];

export const PROCESSO_EFFETTO_UNITA = ["kg", "pz", "lt"] as const;
export type ProcessoEffettoUnita = (typeof PROCESSO_EFFETTO_UNITA)[number];

export const PROCESSO_EFFETTO_ESITI = [
  "previsto",
  "eseguito",
  "annullato",
  "errore",
] as const;
export type ProcessoEffettoEsito = (typeof PROCESSO_EFFETTO_ESITI)[number];

export type ProcessoEffettoDef = {
  id: string;
  processoId: string;
  tipo: ProcessoEffettoTipo;
  codiceMp: string;
  unita: ProcessoEffettoUnita;
  essiccatoreId: string;
  note: string;
  sortOrder: number;
};

export type ProcessoEffettoDraft = {
  tipo: ProcessoEffettoTipo;
  codiceMp: string;
  unita: ProcessoEffettoUnita;
  essiccatoreId: string;
  note: string;
};

export type FoglioProcessoEffetto = {
  id: string;
  definizioneId: string | null;
  tipo: ProcessoEffettoTipo;
  codiceMp: string;
  unita: ProcessoEffettoUnita;
  essiccatoreId: string;
  qtyPrevista: number;
  qtyEffettiva: number | null;
  lottoCodice: string;
  esito: ProcessoEffettoEsito;
  note: string;
  eseguitoAt: string | null;
};

const optionalEssiccatoreId = z
  .string()
  .trim()
  .max(40)
  .optional()
  .default("")
  .transform((v) => v.trim());

export const processoEffettoDraftSchema = z
  .object({
    tipo: z.enum(PROCESSO_EFFETTO_TIPI),
    codiceMp: z.string().trim().max(32).optional().default(""),
    unita: z.enum(PROCESSO_EFFETTO_UNITA).optional().default("kg"),
    essiccatoreId: optionalEssiccatoreId,
    note: z.string().trim().max(1000).optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (
      data.essiccatoreId &&
      !ACTION_ESSICCATORE_IDS.includes(data.essiccatoreId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["essiccatoreId"],
        message: "Essiccatore non valido.",
      });
    }
    if (data.tipo === "essiccatore.carica_cestone" && data.unita !== "kg") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unita"],
        message: "Il carico cestone si registra in kg.",
      });
    }
  });

export const processoEffettiInputSchema = z
  .array(processoEffettoDraftSchema)
  .max(20)
  .optional()
  .default([]);

export const registraEffettoEsecuzioneSchema = z.object({
  effettoEsecuzioneId: z.string().uuid("Effetto non valido."),
  qty: z.number().positive("La quantità deve essere maggiore di zero."),
  codiceMp: z.string().trim().max(32).optional().default(""),
  essiccatoreId: optionalEssiccatoreId,
  lottoCodice: z.string().trim().max(80).optional().default(""),
  note: z.string().trim().max(1000).optional().default(""),
});

export type RegistraEffettoEsecuzioneInput = z.infer<
  typeof registraEffettoEsecuzioneSchema
>;

export function isProcessoEffettoTipo(
  value: string
): value is ProcessoEffettoTipo {
  return (PROCESSO_EFFETTO_TIPI as readonly string[]).includes(value);
}

export function parseEffettoUnita(value: unknown): ProcessoEffettoUnita {
  if (value === "pz" || value === "lt") return value;
  return "kg";
}

export function parseEffettoParametri(
  tipo: ProcessoEffettoTipo,
  raw: unknown
): Pick<ProcessoEffettoDef, "codiceMp" | "unita" | "essiccatoreId"> {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const codiceMp = String(obj.codiceMp ?? obj.codice_mp ?? "").trim();
  const unita = parseEffettoUnita(obj.unita);
  const essiccatoreId = String(
    obj.essiccatoreId ?? obj.essiccatore_id ?? ""
  ).trim();
  return {
    codiceMp,
    unita: tipo === "essiccatore.carica_cestone" ? "kg" : unita,
    essiccatoreId: ACTION_ESSICCATORE_IDS.includes(essiccatoreId)
      ? essiccatoreId
      : "",
  };
}

export function effettoParametriToJson(
  draft: ProcessoEffettoDraft
): Record<string, string> {
  if (draft.tipo === "essiccatore.carica_cestone") {
    return {
      unita: "kg",
      essiccatoreId: draft.essiccatoreId.trim(),
    };
  }
  return {
    codiceMp: draft.codiceMp.trim().toUpperCase(),
    unita: draft.unita,
  };
}

export function labelEffettoTipo(tipo: ProcessoEffettoTipo): string {
  switch (tipo) {
    case "magazzino.consuma":
      return "Magazzino · consuma";
    case "magazzino.produce":
      return "Magazzino · produce";
    case "essiccatore.carica_cestone":
      return "Essiccatore · carica cestone";
    default:
      return tipo;
  }
}

export function labelEffettoEsito(esito: ProcessoEffettoEsito): string {
  switch (esito) {
    case "previsto":
      return "Da registrare";
    case "eseguito":
      return "Eseguito";
    case "annullato":
      return "Annullato";
    case "errore":
      return "Errore";
    default:
      return esito;
  }
}

export function labelEssiccatoreEffetto(id: string): string {
  return ACTION_ESSICCATORI.find((e) => e.id === id)?.nome ?? id;
}

export function formatEffettoDef(e: {
  tipo: ProcessoEffettoTipo;
  codiceMp: string;
  unita: ProcessoEffettoUnita;
  essiccatoreId: string;
}): string {
  const head = labelEffettoTipo(e.tipo);
  if (e.tipo === "essiccatore.carica_cestone") {
    return e.essiccatoreId
      ? `${head} · ${labelEssiccatoreEffetto(e.essiccatoreId)}`
      : `${head} · essiccatore in esecuzione`;
  }
  return e.codiceMp
    ? `${head} · ${e.codiceMp} (${e.unita})`
    : `${head} · prodotto in esecuzione (${e.unita})`;
}
