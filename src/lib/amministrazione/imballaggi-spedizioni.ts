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

/** Prefisso codice per voci a doppio ruolo (Confezione e Isolamento). */
export const IMBALLAGGIO_CI_PREFIX = "C&I-";

export const IMBALLAGGIO_PRODOTTO_UM = ["kg", "g", "lt", "ml", "pz"] as const;

export type ImballaggioProdottoUm = (typeof IMBALLAGGIO_PRODOTTO_UM)[number];

export const IMBALLAGGIO_PRODOTTO_UM_LABEL: Record<ImballaggioProdottoUm, string> =
  {
    kg: "kg",
    g: "g",
    lt: "lt",
    ml: "ml",
    pz: "pz",
  };

export type ImballaggioVoceProdottoLink = {
  prodottoId: string;
  maxKg: number;
  unitaMisura: ImballaggioProdottoUm;
};

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
  doppioRuolo: boolean;
  voceGemellaId: string | null;
  prodotti: ImballaggioVoceProdottoLink[];
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
  doppioRuolo?: boolean;
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

/** Accetta numero > 0, stringa numerica, vuoto o null (mai 0 da coerce). */
const optionalPositiveQty = z.preprocess((val) => {
  if (val === "" || val === undefined || val === null) return null;
  if (typeof val === "string") {
    const n = Number(val.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof val === "number") {
    return Number.isFinite(val) && val > 0 ? val : null;
  }
  return val;
}, z.number().positive().nullable());

export const imballaggioVoceInputSchema = z
  .object({
    stadio: z.enum(["movimentazione", "confezione", "isolamento"]),
    codice: z.string().trim().min(1, "Codice obbligatorio").max(64),
    nome: z.string().trim().min(1, "Nome obbligatorio").max(200),
    largoMm: optionalPositiveQty,
    profonditaMm: optionalPositiveQty,
    altezzaMm: optionalPositiveQty,
    capacitaLt: optionalPositiveQty,
    note: z.string().optional(),
    sortOrder: z.number().int().optional(),
    doppioRuolo: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.doppioRuolo && v.stadio === "movimentazione") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Il doppio ruolo vale solo per confezione o isolamento.",
        path: ["doppioRuolo"],
      });
    }
  });

export const syncImballaggioVoceProdottiSchema = z.object({
  voceId: z.string().uuid(),
  links: z.array(
    z.object({
      prodottoId: z.string().uuid(),
      maxKg: z.number().positive("La quantità max deve essere maggiore di zero"),
      unitaMisura: z.enum(IMBALLAGGIO_PRODOTTO_UM).default("kg"),
    })
  ),
});

export const corriereInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome corriere obbligatorio").max(200),
  note: z.string().optional(),
});

export function normalizeCiCodice(codice: string): string {
  const t = codice.trim();
  const suffix = t.replace(/^(C&I|CNF|ISO|MOV)[-_]?/i, "").trim();
  return `${IMBALLAGGIO_CI_PREFIX}${suffix || t}`;
}

export function otherDualStadio(
  stadio: ImballaggioStadio
): "confezione" | "isolamento" | null {
  if (stadio === "confezione") return "isolamento";
  if (stadio === "isolamento") return "confezione";
  return null;
}

export function imballaggiPerCondizioneListino(
  voci: ImballaggioVoce[]
): ImballaggioVoce[] {
  return voci.filter((v) => {
    if (v.stadio === "movimentazione") return false;
    if (v.doppioRuolo && v.stadio === "isolamento") return false;
    return v.stadio === "confezione" || v.stadio === "isolamento";
  });
}

export function parseImballaggioProdottoUm(
  value: string | null | undefined
): ImballaggioProdottoUm {
  return (IMBALLAGGIO_PRODOTTO_UM as readonly string[]).includes(value ?? "")
    ? (value as ImballaggioProdottoUm)
    : "kg";
}

export function mapImballaggioVoceRow(
  row: ImballaggioVoceRow,
  prodotti: ImballaggioVoceProdottoLink[] = []
): ImballaggioVoce {
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
    doppioRuolo: Boolean(row.doppio_ruolo),
    voceGemellaId: row.voce_gemella_id ?? null,
    prodotti,
  };
}

export function labelImballaggioVoce(v: ImballaggioVoce): string {
  return v.doppioRuolo ? `${v.nome} (C&I)` : v.nome;
}

export function voceCollegaProdotti(v: Pick<ImballaggioVoce, "stadio" | "doppioRuolo">) {
  return v.stadio === "isolamento" || (v.stadio === "confezione" && v.doppioRuolo);
}

export function filterVociForWizardStadio(
  voci: ImballaggioVoce[],
  stadio: ImballaggioStadio,
  prodottoId: string | null
): ImballaggioVoce[] {
  if (stadio === "movimentazione") {
    return voci.filter((v) => v.stadio === "movimentazione");
  }
  const linked = (v: ImballaggioVoce) =>
    Boolean(
      prodottoId && v.prodotti.some((p) => p.prodottoId === prodottoId)
    );
  if (stadio === "confezione") {
    return voci.filter((v) => {
      if (v.stadio === "confezione" && !v.doppioRuolo) return true;
      if (v.doppioRuolo && v.stadio === "confezione") return linked(v);
      return false;
    });
  }
  return voci.filter(
    (v) => v.stadio === "isolamento" && !v.doppioRuolo && linked(v)
  );
}

export function mapCorriereRow(row: CorriereRow): Corriere {
  return {
    id: row.id,
    nome: row.nome,
    note: row.note ?? "",
  };
}

export function formatMisureImballaggio(v: ImballaggioVoce): string {
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
  /** `""` mentre si digita (ClearableNumberInput). */
  quantita: number | "";
  kgProdotto: number | null | "";
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
      const q = typeof n.quantita === "number" ? n.quantita : 0;
      const kg = typeof n.kgProdotto === "number" ? n.kgProdotto : 0;
      const mult = parentMult * q;
      if (n.stadio === "prodotto_kg") {
        sum += parentMult * q * kg;
      } else {
        sum += walk(n.children, mult);
      }
    }
    return sum;
  }
  return Math.round(walk(nodi, 1) * 1000) / 1000;
}

export type ConfezionamentoNodoNormalized = Omit<
  ConfezionamentoNodoDraft,
  "quantita" | "kgProdotto" | "children"
> & {
  quantita: number;
  kgProdotto: number | null;
  children: ConfezionamentoNodoNormalized[];
};

export type ConfezionamentoNormalized = Omit<ConfezionamentoDraft, "nodi"> & {
  nodi: ConfezionamentoNodoNormalized[];
};

/** Normalizza qty/kg vuoti prima del salvataggio. */
export function normalizeConfezionamentoDraft(
  draft: ConfezionamentoDraft
): ConfezionamentoNormalized {
  function norm(
    nodes: ConfezionamentoNodoDraft[]
  ): ConfezionamentoNodoNormalized[] {
    return nodes.map((n) => ({
      ...n,
      quantita:
        n.quantita === "" || !Number.isFinite(n.quantita) ? 0 : n.quantita,
      kgProdotto:
        n.kgProdotto === "" || n.kgProdotto == null
          ? n.stadio === "prodotto_kg"
            ? 0
            : null
          : n.kgProdotto,
      children: norm(n.children),
    }));
  }
  return { ...draft, nodi: norm(draft.nodi) };
}

export function childStadioFor(
  parent: OrdineConfezionamentoNodoStadio | null,
  modo: OrdineConfezionamentoModo,
  parentVoce?: ImballaggioVoce | null
): OrdineConfezionamentoNodoStadio | null {
  if (!parent) {
    return modo === "su_pallet" ? "movimentazione" : "confezione";
  }
  if (parent === "movimentazione") return "confezione";
  if (parent === "confezione") {
    if (parentVoce?.doppioRuolo) return "prodotto_kg";
    return "isolamento";
  }
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

const quantitaDraftSchema = z.union([
  z.number().positive(),
  z.literal(""),
]);

export const confezionamentoNodoSchema: z.ZodType<ConfezionamentoNodoDraft> =
  z.lazy(() =>
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
      quantita: quantitaDraftSchema,
      kgProdotto: z.union([z.number(), z.null(), z.literal("")]),
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
