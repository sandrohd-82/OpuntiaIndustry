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

export function labelNomeCommercialeStadio(stadio: ImballaggioStadio): string {
  if (stadio === "movimentazione") return "Tipo di Movimentazione";
  if (stadio === "confezione") return "Tipo di Confezione";
  return "Tipo di Isolamento";
}

export type ImballaggioVoce = {
  id: string;
  stadio: ImballaggioStadio;
  codice: string;
  nome: string;
  nomeCommerciale: string;
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
  nomeCommerciale?: string;
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
    nomeCommerciale: z.string().trim().max(200).optional().default(""),
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

export function standardConfezioneProdotto(
  voce: ImballaggioVoce | undefined,
  prodottoId: string
): { max: number; um: ImballaggioProdottoUm } | null {
  if (!voce || !prodottoId) return null;
  const link = voce.prodotti.find((p) => p.prodottoId === prodottoId);
  if (!link || !Number.isFinite(link.maxKg) || link.maxKg <= 0) return null;
  return { max: link.maxKg, um: link.unitaMisura };
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
    nomeCommerciale: row.nome_commerciale ?? "",
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
  /** Allineamento pianta: peso per elemento o complessivo (solo carico magazzino). */
  pesoModo?: "per_elemento" | "complessivo";
  pesiElementiKg?: Array<number | "">;
  pesoComplessivoKg?: number | "" | null;
  pesoMotivazione?: string;
};

export function emptyConfezionamentoDraft(): ConfezionamentoDraft {
  return {
    movimentazioneModo: "su_pallet",
    palletCatalogoId: null,
    palletMisureCustom: "",
    nodi: [],
    coerenzaIgnorata: false,
    note: "",
    pesoModo: "per_elemento",
    pesiElementiKg: [],
    pesoComplessivoKg: "",
    pesoMotivazione: "",
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
  pesoModo: z.enum(["per_elemento", "complessivo"]).optional(),
  pesiElementiKg: z.array(z.union([z.number(), z.literal("")])).optional(),
  pesoComplessivoKg: z
    .union([z.number(), z.null(), z.literal("")])
    .optional(),
  pesoMotivazione: z.string().optional(),
});

export function updateNodoInTree(
  nodes: ConfezionamentoNodoDraft[],
  localId: string,
  patch: Partial<ConfezionamentoNodoDraft>
): ConfezionamentoNodoDraft[] {
  return nodes.map((n) => {
    if (n.localId === localId) return { ...n, ...patch };
    return { ...n, children: updateNodoInTree(n.children, localId, patch) };
  });
}

export function removeNodoFromTree(
  nodes: ConfezionamentoNodoDraft[],
  localId: string
): ConfezionamentoNodoDraft[] {
  return nodes
    .filter((n) => n.localId !== localId)
    .map((n) => ({
      ...n,
      children: removeNodoFromTree(n.children, localId),
    }));
}

export function addChildToNode(
  nodes: ConfezionamentoNodoDraft[],
  parentId: string,
  child: ConfezionamentoNodoDraft
): ConfezionamentoNodoDraft[] {
  return nodes.map((n) => {
    if (n.localId === parentId) {
      return { ...n, children: [...n.children, child] };
    }
    return {
      ...n,
      children: addChildToNode(n.children, parentId, child),
    };
  });
}

export function labelStadioConfezionamento(
  stadio: OrdineConfezionamentoNodoStadio
): string {
  if (stadio === "movimentazione") return "Movimentazione";
  if (stadio === "confezione") return "Confezione";
  if (stadio === "isolamento") return "Isolamento";
  return "Prodotto (kg)";
}

/** Catalogo magazzino: tutte le voci dello stadio (non solo quelle legate al listino). */
export function filterVociForMagazzinoStadio(
  voci: ImballaggioVoce[],
  stadio: ImballaggioStadio
): ImballaggioVoce[] {
  if (stadio === "movimentazione") {
    return voci.filter((v) => v.stadio === "movimentazione");
  }
  if (stadio === "confezione") {
    return voci.filter((v) => v.stadio === "confezione");
  }
  return voci.filter((v) => v.stadio === "isolamento" && !v.doppioRuolo);
}

function nodoQty(n: ConfezionamentoNodoDraft): number {
  return typeof n.quantita === "number" && n.quantita > 0 ? n.quantita : 0;
}

function formatNodoRiga(n: ConfezionamentoNodoDraft): string {
  const q = nodoQty(n);
  if (n.stadio === "prodotto_kg") {
    const kg = typeof n.kgProdotto === "number" ? n.kgProdotto : 0;
    return `${q}× ${kg} kg`;
  }
  return `${q} ${n.nome || n.stadio}`;
}

export function formatConfezionamentoRiepilogo(
  nodi: ConfezionamentoNodoDraft[]
): string {
  if (!nodi.length) return "";
  return nodiToBlocchi(nodi)
    .map((b, i) => formatBloccoRiepilogo(b, i + 1))
    .filter(Boolean)
    .join(" · ");
}

export function idsFromConfezionamento(nodi: ConfezionamentoNodoDraft[]): {
  movimentazioneId: string | null;
  confezioneId: string | null;
  isolamentoId: string | null;
} {
  let movimentazioneId: string | null = null;
  let confezioneId: string | null = null;
  let isolamentoId: string | null = null;
  function walk(nodes: ConfezionamentoNodoDraft[]) {
    for (const n of nodes) {
      if (n.stadio === "movimentazione" && n.catalogoId && !movimentazioneId) {
        movimentazioneId = n.catalogoId;
      }
      if (n.stadio === "confezione" && n.catalogoId && !confezioneId) {
        confezioneId = n.catalogoId;
      }
      if (n.stadio === "isolamento" && n.catalogoId && !isolamentoId) {
        isolamentoId = n.catalogoId;
      }
      walk(n.children);
    }
  }
  walk(nodi);
  if (!isolamentoId && confezioneId) isolamentoId = confezioneId;
  return { movimentazioneId, confezioneId, isolamentoId };
}

export function validateConfezionamentoBlocchi(
  draft: ConfezionamentoNormalized
): string | null {
  const blocchi = nodiToBlocchi(draft.nodi);
  if (!blocchi.length) {
    return "Aggiungi almeno un blocco di confezionamento.";
  }
  for (const [i, b] of blocchi.entries()) {
    const n = i + 1;
    if (!b.movimentazione && !b.confezionamento && !b.isolamento) {
      return `Il blocco ${n} è vuoto. Aggiungi movimentazione, confezione o isolamento.`;
    }
    if (b.movimentazione && !b.movimentazione.catalogoId) {
      return `Seleziona la movimentazione del blocco ${n}.`;
    }
    if (b.confezionamento) {
      if (!b.confezionamento.catalogoId) {
        return `Seleziona il confezionamento del blocco ${n}.`;
      }
      if (voceQty(b.confezionamento) <= 0) {
        return `Indica quanti elementi di confezione ha il blocco ${n}.`;
      }
    }
    if (b.isolamento) {
      if (!b.isolamento.catalogoId) {
        return `Seleziona l’isolamento del blocco ${n}.`;
      }
      if (voceQty(b.isolamento) <= 0) {
        return `Indica quanti elementi di isolamento ha il blocco ${n}.`;
      }
    }
    if (b.collegato && (!b.confezionamento || !b.isolamento)) {
      return `Per collegare, il blocco ${n} deve avere confezione e isolamento.`;
    }
  }
  return null;
}

export type ConfezionamentoNodoRow = {
  id: string;
  parent_id: string | null;
  stadio: OrdineConfezionamentoNodoStadio;
  catalogo_id: string | null;
  nome_snapshot: string;
  codice_snapshot: string;
  quantita: number;
  kg_prodotto: number | null;
  sort_order: number;
};

export function draftNodiFromRows(
  rows: ConfezionamentoNodoRow[]
): ConfezionamentoNodoDraft[] {
  const byParent = new Map<string | null, ConfezionamentoNodoRow[]>();
  for (const r of rows) {
    const key = r.parent_id;
    const list = byParent.get(key) ?? [];
    list.push(r);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }
  function build(parentId: string | null): ConfezionamentoNodoDraft[] {
    return (byParent.get(parentId) ?? []).map((r) => ({
      localId: r.id,
      stadio: r.stadio,
      catalogoId: r.catalogo_id,
      nome: r.nome_snapshot,
      codice: r.codice_snapshot,
      quantita: Number(r.quantita) || 1,
      kgProdotto: r.kg_prodotto == null ? null : Number(r.kg_prodotto),
      children: build(r.id),
    }));
  }
  return build(null);
}

export type ConfezionamentoBloccoVoce = {
  localId: string;
  catalogoId: string | null;
  nome: string;
  codice: string;
  quantita: number | "";
};

export type ConfezionamentoBlocco = {
  localId: string;
  movimentazione: ConfezionamentoBloccoVoce | null;
  confezionamento: ConfezionamentoBloccoVoce | null;
  isolamento: ConfezionamentoBloccoVoce | null;
  collegato: boolean;
};

export function emptyBloccoVoce(): ConfezionamentoBloccoVoce {
  return {
    localId: newNodoLocalId(),
    catalogoId: null,
    nome: "",
    codice: "",
    quantita: 1,
  };
}

export function emptyBlocco(): ConfezionamentoBlocco {
  return {
    localId: newNodoLocalId(),
    movimentazione: null,
    confezionamento: null,
    isolamento: null,
    collegato: false,
  };
}

function voceQty(v: ConfezionamentoBloccoVoce): number {
  return typeof v.quantita === "number" && v.quantita > 0 ? v.quantita : 0;
}

function nodoToVoce(n: ConfezionamentoNodoDraft): ConfezionamentoBloccoVoce {
  return {
    localId: n.localId,
    catalogoId: n.catalogoId,
    nome: n.nome,
    codice: n.codice,
    quantita: n.quantita === "" ? "" : n.quantita,
  };
}

function voceToNodo(
  stadio: "movimentazione" | "confezione" | "isolamento",
  v: ConfezionamentoBloccoVoce,
  children: ConfezionamentoNodoDraft[] = []
): ConfezionamentoNodoDraft {
  return {
    localId: v.localId,
    stadio,
    catalogoId: v.catalogoId,
    nome: v.nome,
    codice: v.codice,
    quantita: v.quantita === "" ? 1 : v.quantita,
    kgProdotto: null,
    children,
  };
}

export function formatBloccoRiepilogo(
  b: ConfezionamentoBlocco,
  indice: number
): string {
  const parts: string[] = [];
  if (b.movimentazione) {
    parts.push(b.movimentazione.nome || "movimentazione");
  }
  if (b.collegato && b.confezionamento && b.isolamento) {
    const n = voceQty(b.confezionamento) || voceQty(b.isolamento);
    parts.push(
      `${n} ${(b.confezionamento.nome || "confezione")} con dentro ${b.isolamento.nome || "isolamento"}`
    );
  } else {
    if (b.confezionamento) {
      parts.push(
        `${voceQty(b.confezionamento)} ${b.confezionamento.nome || "confezione"}`
      );
    }
    if (b.isolamento) {
      parts.push(
        `${voceQty(b.isolamento)} ${b.isolamento.nome || "isolamento"}`
      );
    }
  }
  return `Blocco ${indice}: ${parts.join(" · ") || "vuoto"}`;
}

export function nodiToBlocchi(
  nodi: ConfezionamentoNodoDraft[]
): ConfezionamentoBlocco[] {
  return nodi.map((root) => {
    if (root.stadio === "movimentazione") {
      const conf = root.children.find((c) => c.stadio === "confezione") ?? null;
      const isoNested =
        conf?.children.find((c) => c.stadio === "isolamento") ?? null;
      const isoDirect =
        root.children.find((c) => c.stadio === "isolamento") ?? null;
      const collegato = Boolean(conf && isoNested);
      const isolamento = collegato
        ? {
            ...nodoToVoce(isoNested!),
            quantita: conf!.quantita,
          }
        : isoDirect
          ? nodoToVoce(isoDirect)
          : null;
      const isWrapper = !root.catalogoId && root.nome === "Blocco";
      return {
        localId: root.localId,
        movimentazione: isWrapper ? null : nodoToVoce(root),
        confezionamento: conf ? nodoToVoce(conf) : null,
        isolamento,
        collegato,
      };
    }
    if (root.stadio === "confezione") {
      const iso = root.children.find((c) => c.stadio === "isolamento") ?? null;
      return {
        localId: root.localId,
        movimentazione: null,
        confezionamento: nodoToVoce(root),
        isolamento: iso
          ? { ...nodoToVoce(iso), quantita: root.quantita }
          : null,
        collegato: Boolean(iso),
      };
    }
    return {
      localId: root.localId,
      movimentazione: null,
      confezionamento: null,
      isolamento: root.stadio === "isolamento" ? nodoToVoce(root) : null,
      collegato: false,
    };
  });
}

export function blocchiToNodi(
  blocchi: ConfezionamentoBlocco[]
): ConfezionamentoNodoDraft[] {
  return blocchi.map((b) => {
    const kids: ConfezionamentoNodoDraft[] = [];
    if (b.collegato && b.confezionamento && b.isolamento) {
      const isoUno: ConfezionamentoBloccoVoce = {
        ...b.isolamento,
        quantita: 1,
      };
      kids.push(voceToNodo("confezione", b.confezionamento, [
        voceToNodo("isolamento", isoUno),
      ]));
    } else {
      if (b.confezionamento) {
        kids.push(voceToNodo("confezione", b.confezionamento));
      }
      if (b.isolamento) {
        kids.push(voceToNodo("isolamento", b.isolamento));
      }
    }
    if (b.movimentazione) {
      return voceToNodo("movimentazione", {
        ...b.movimentazione,
        quantita: 1,
      }, kids);
    }
    if (kids.length === 1) return kids[0]!;
    return {
      localId: b.localId,
      stadio: "movimentazione",
      catalogoId: null,
      nome: "Blocco",
      codice: "",
      quantita: 1,
      kgProdotto: null,
      children: kids,
    };
  });
}

export function draftFromBlocchi(
  draft: ConfezionamentoDraft,
  blocchi: ConfezionamentoBlocco[]
): ConfezionamentoDraft {
  const hasPallet = blocchi.some((b) => Boolean(b.movimentazione?.catalogoId));
  return {
    ...draft,
    movimentazioneModo: hasPallet ? "su_pallet" : "nessun_pallet",
    palletCatalogoId:
      blocchi.find((b) => b.movimentazione?.catalogoId)?.movimentazione
        ?.catalogoId ?? null,
    nodi: blocchiToNodi(blocchi),
  };
}
