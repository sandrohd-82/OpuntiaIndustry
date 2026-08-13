import { z } from "zod";
import type {
  CorriereRow,
  ImballaggioStadio,
  ImballaggioVoceRow,
  OrdineConfezionamentoModo,
  OrdineConfezionamentoNodoStadio,
} from "@/types/database";

export type { ImballaggioStadio };

export const IMBALLAGGIO_STADI: {
  id: ImballaggioStadio;
  label: string;
  descrizione: string;
}[] = [
  {
    id: "movimentazione",
    label: "Stadio 1 · Movimentazione",
    descrizione: "Pallet / unità di movimentazione (Europallet, ISO, …)",
  },
  {
    id: "confezione",
    label: "Stadio 2 · Confezione",
    descrizione: "Cartoni, bidoni e imballi secondari",
  },
  {
    id: "isolamento",
    label: "Stadio 3 · Isolamento",
    descrizione: "Sacchi e isolamento a contatto prodotto",
  },
];

export type ImballaggioVoce = {
  id: string;
  stadio: ImballaggioStadio;
  codice: string;
  nome: string;
  largoMm: number | null;
  profonditaMm: number | null;
  altezzaMm: number | null;
  capacitaLt: number | null;
  note: string;
  sortOrder: number;
};

export type ImballaggioVoceInput = {
  stadio: ImballaggioStadio;
  codice: string;
  nome: string;
  largoMm?: number | null;
  profonditaMm?: number | null;
  altezzaMm?: number | null;
  capacitaLt?: number | null;
  note?: string;
  sortOrder?: number;
};

export type Corriere = {
  id: string;
  nome: string;
  note: string;
};

export type CorriereInput = {
  nome: string;
  note?: string;
};

export const imballaggioVoceInputSchema = z.object({
  stadio: z.enum(["movimentazione", "confezione", "isolamento"]),
  codice: z.string().trim().min(1, "Codice obbligatorio").max(64),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(200),
  largoMm: z.number().positive().nullable().optional(),
  profonditaMm: z.number().positive().nullable().optional(),
  altezzaMm: z.number().positive().nullable().optional(),
  capacitaLt: z.number().positive().nullable().optional(),
  note: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const corriereInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome corriere obbligatorio").max(200),
  note: z.string().optional(),
});

export function mapImballaggioVoceRow(row: ImballaggioVoceRow): ImballaggioVoce {
  return {
    id: row.id,
    stadio: row.stadio,
    codice: row.codice,
    nome: row.nome,
    largoMm: row.largo_mm == null ? null : Number(row.largo_mm),
    profonditaMm: row.profondita_mm == null ? null : Number(row.profondita_mm),
    altezzaMm: row.altezza_mm == null ? null : Number(row.altezza_mm),
    capacitaLt: row.capacita_lt == null ? null : Number(row.capacita_lt),
    note: row.note ?? "",
    sortOrder: row.sort_order ?? 0,
  };
}

export function mapCorriereRow(row: CorriereRow): Corriere {
  return {
    id: row.id,
    nome: row.nome,
    note: row.note ?? "",
  };
}

export function formatMisureImballaggio(v: ImballaggioVoce): string {
  if (v.capacitaLt != null) return `${v.capacitaLt} lt`;
  const parts = [v.largoMm, v.profonditaMm, v.altezzaMm].filter(
    (n): n is number => n != null
  );
  if (!parts.length) return "—";
  return parts.map((n) => String(n)).join("×") + " mm";
}

/** Nodo albero confezionamento (client / wizard). */
export type ConfezionamentoNodoDraft = {
  localId: string;
  stadio: OrdineConfezionamentoNodoStadio;
  catalogoId: string | null;
  nome: string;
  codice: string;
  quantita: number;
  kgProdotto: number | null;
  children: ConfezionamentoNodoDraft[];
};

export type ConfezionamentoDraft = {
  movimentazioneModo: OrdineConfezionamentoModo;
  palletCatalogoId: string | null;
  palletMisureCustom: string;
  nodi: ConfezionamentoNodoDraft[];
  coerenzaIgnorata: boolean;
  note: string;
};

export function emptyConfezionamentoDraft(): ConfezionamentoDraft {
  return {
    movimentazioneModo: "su_pallet",
    palletCatalogoId: null,
    palletMisureCustom: "",
    nodi: [],
    coerenzaIgnorata: false,
    note: "",
  };
}

export function newNodoLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyNodo(
  stadio: OrdineConfezionamentoNodoStadio
): ConfezionamentoNodoDraft {
  return {
    localId: newNodoLocalId(),
    stadio,
    catalogoId: null,
    nome: "",
    codice: "",
    quantita: 1,
    kgProdotto: stadio === "prodotto_kg" ? 0 : null,
    children: [],
  };
}

/** Totale kg prodotto lungo l’albero (prodotto delle qty × kg foglia). */
export function totaleKgConfezionati(nodi: ConfezionamentoNodoDraft[]): number {
  function walk(nodes: ConfezionamentoNodoDraft[], parentMult: number): number {
    let sum = 0;
    for (const n of nodes) {
      const q = Number(n.quantita) || 0;
      const mult = parentMult * q;
      if (n.stadio === "prodotto_kg") {
        sum += parentMult * q * (Number(n.kgProdotto) || 0);
      } else {
        sum += walk(n.children, mult);
      }
    }
    return sum;
  }
  return Math.round(walk(nodi, 1) * 1000) / 1000;
}

export function childStadioFor(
  parent: OrdineConfezionamentoNodoStadio | null,
  modo: OrdineConfezionamentoModo
): OrdineConfezionamentoNodoStadio | null {
  if (!parent) {
    return modo === "su_pallet" ? "movimentazione" : "confezione";
  }
  if (parent === "movimentazione") return "confezione";
  if (parent === "confezione") return "isolamento";
  if (parent === "isolamento") return "prodotto_kg";
  return null;
}

export const spedizioneWizardSchema = z
  .object({
    spedizioneMezzo: z.literal("corriere"),
    corriereId: z.string().uuid().nullable(),
    corriereDaCompilare: z.boolean(),
    spedizioneACarico: z.enum(["cliente", "agrinsicilia", "diviso"]),
    spedizionePctAgrinsicilia: z.number().min(0).max(100).nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.corriereDaCompilare && !v.corriereId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Seleziona un corriere oppure «Compilerò dopo».",
        path: ["corriereId"],
      });
    }
    if (v.spedizioneACarico === "diviso") {
      if (
        v.spedizionePctAgrinsicilia == null ||
        !Number.isFinite(v.spedizionePctAgrinsicilia)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Indica la % a carico Agrinsicilia.",
          path: ["spedizionePctAgrinsicilia"],
        });
      }
    }
  });

export const confezionamentoNodoSchema: z.ZodType<ConfezionamentoNodoDraft> = z.lazy(
  () =>
    z.object({
      localId: z.string().min(1),
      stadio: z.enum([
        "movimentazione",
        "confezione",
        "isolamento",
        "prodotto_kg",
      ]),
      catalogoId: z.string().uuid().nullable(),
      nome: z.string(),
      codice: z.string(),
      quantita: z.number().positive(),
      kgProdotto: z.number().nullable(),
      children: z.array(confezionamentoNodoSchema),
    })
);

export const confezionamentoDraftSchema = z.object({
  movimentazioneModo: z.enum(["su_pallet", "nessun_pallet"]),
  palletCatalogoId: z.string().uuid().nullable(),
  palletMisureCustom: z.string(),
  nodi: z.array(confezionamentoNodoSchema),
  coerenzaIgnorata: z.boolean(),
  note: z.string(),
});
