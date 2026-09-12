import { z } from "zod";
import { isValidLottoAgrinsicilia } from "@/lib/magazzino/lotto-agrinsicilia";

export type MagazzinoCatalogKind = "materia_prima" | "prodotto_fornitore";

/** Categoria di utilizzo articolo acquistato. */
export type CategoriaUtilizzo =
  | "mat_consumo"
  | "mat_poco_consumo"
  | "acquisti_occasionali";

export const CATEGORIA_UTILIZZO_OPTIONS: ReadonlyArray<{
  value: CategoriaUtilizzo;
  label: string;
  requiresMagazzino: boolean;
}> = [
  {
    value: "mat_consumo",
    label: "Mat. Consumo",
    requiresMagazzino: true,
  },
  {
    value: "mat_poco_consumo",
    label: "Mat. Poco Consumo",
    requiresMagazzino: true,
  },
  {
    value: "acquisti_occasionali",
    label: "Acquisti Occasionali",
    requiresMagazzino: false,
  },
] as const;

export function labelCategoriaUtilizzo(
  v: CategoriaUtilizzo | null | undefined
): string {
  if (!v) return "Da classificare";
  return (
    CATEGORIA_UTILIZZO_OPTIONS.find((o) => o.value === v)?.label ?? v
  );
}

export function categoriaRequiresMagazzino(
  v: CategoriaUtilizzo | null | undefined
): boolean {
  if (!v) return true; // finché non classificato, può entrare in magazzino
  return (
    CATEGORIA_UTILIZZO_OPTIONS.find((o) => o.value === v)?.requiresMagazzino ??
    false
  );
}

export type Reparto = {
  id: string;
  codice: string;
  nome: string;
  attivo: boolean;
  note: string;
  createdAt: string;
};

export type MagazzinoUnita = "kg" | "pz";

export type MagazzinoPanoramicaSezione = {
  articoli: number;
  conGiacenza: number;
  sottoSoglia: number;
  inSoglia: number;
};

export type MagazzinoPanoramica = {
  materiaPrima: MagazzinoPanoramicaSezione;
  prodottiConsumo: MagazzinoPanoramicaSezione;
  agrinsicilia: MagazzinoPanoramicaSezione;
  noteAperte: number;
};

export type ScorteSemaforo = "ok" | "soglia" | "sotto" | "n/d";

export type MagazzinoProdottoRiga = {
  catalogKind: MagazzinoCatalogKind;
  prodottoId: string;
  codice: string;
  nome: string;
  /** Titolo operativo magazzino (leggibilità). */
  titoloMagazzino: string | null;
  isBio: boolean;
  categoriaUtilizzo: CategoriaUtilizzo | null;
  barcode: string | null;
  /** Path Storage foto prodotto (bucket magazzino-prodotti). */
  fotoPath: string | null;
  schedaProvvisoria: boolean;
  giacenzaId: string | null;
  quantita: number;
  quantitaRiserva: number | null;
  unita: MagazzinoUnita;
  repartoId: string | null;
  repartoNome: string | null;
  semaforo: ScorteSemaforo;
};

/** Etichetta da mostrare in lista: titolo magazzino o fallback nome catalogo. */
export function labelMagazzinoArticolo(row: {
  titoloMagazzino?: string | null;
  nome: string;
}): string {
  const t = row.titoloMagazzino?.trim();
  return t || row.nome;
}

export type NotaAcquistoStato = "bozza" | "aperta" | "chiusa" | "annullata";

export type NotaAcquistoRiga = {
  id: string;
  catalogKind: MagazzinoCatalogKind;
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantitaRichiesta: number;
  unita: MagazzinoUnita;
  motivo: string;
};

export type NotaAcquisto = {
  id: string;
  numero: string;
  versione: number;
  documentoStato: NotaAcquistoStato;
  titolo: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  righe: NotaAcquistoRiga[];
};

export const updateMagazzinoProdottoSchema = z.object({
  catalogKind: z.enum(["materia_prima", "prodotto_fornitore"]),
  prodottoId: z.string().uuid(),
  categoriaUtilizzo: z.enum([
    "mat_consumo",
    "mat_poco_consumo",
    "acquisti_occasionali",
  ]),
  titoloMagazzino: z.string().trim().min(1, "Titolo magazzino obbligatorio.").max(200),
  /** Obbligatorio solo se si modifica un titolo già presente. */
  confermaTitoloAttuale: z.string().trim().max(200).optional(),
  quantita: z.number().min(0),
  quantitaRiserva: z.number().min(0).nullable(),
  unita: z.enum(["kg", "pz"]),
  repartoId: z.string().uuid().nullable(),
});

export type UpdateMagazzinoProdottoInput = z.infer<
  typeof updateMagazzinoProdottoSchema
>;

export const repartoInputSchema = z.object({
  codice: z.string().trim().min(1).max(32),
  nome: z.string().trim().min(1).max(200),
  attivo: z.boolean().optional(),
  note: z.string().trim().optional(),
});

export type RepartoInput = z.infer<typeof repartoInputSchema>;

export function computeSemaforo(
  quantita: number,
  quantitaRiserva: number | null | undefined
): ScorteSemaforo {
  if (quantitaRiserva == null || !Number.isFinite(quantitaRiserva)) {
    return "n/d";
  }
  if (quantita < quantitaRiserva) return "sotto";
  if (quantita === quantitaRiserva) return "soglia";
  return "ok";
}

export function quantitaDaOrdinare(
  quantita: number,
  quantitaRiserva: number
): number {
  const delta = quantitaRiserva - quantita;
  return Math.max(1, Math.round(delta * 1000) / 1000);
}

export const MOTIVO_SENZA_FOGLIO = ["inventario", "rivisita_ordine"] as const;
export type MotivoSenzaFoglio = (typeof MOTIVO_SENZA_FOGLIO)[number];

export const MOTIVO_SENZA_FOGLIO_LABEL: Record<MotivoSenzaFoglio, string> = {
  inventario: "Inventario",
  rivisita_ordine: "Rivisita di ordine",
};

/** Unità carico Agrinsicilia: scheda prodotto + override operatore. */
export const MAGAZZINO_CARICO_UNITA = ["kg", "g", "lt", "ml", "pz"] as const;
export type MagazzinoCaricoUnita = (typeof MAGAZZINO_CARICO_UNITA)[number];

export const MAGAZZINO_CARICO_UNITA_OPTIONS: ReadonlyArray<{
  value: MagazzinoCaricoUnita;
  label: string;
}> = [
  { value: "kg", label: "kg" },
  { value: "g", label: "g (gr)" },
  { value: "lt", label: "lt" },
  { value: "ml", label: "ml" },
  { value: "pz", label: "pz" },
];

export function isMagazzinoCaricoUnita(
  value: unknown
): value is MagazzinoCaricoUnita {
  return (
    value === "kg" ||
    value === "g" ||
    value === "lt" ||
    value === "ml" ||
    value === "pz"
  );
}

/** Normalizza UM scheda / listino / input libero (gr, l, nr…). */
export function parseUnitaCarico(value: unknown): MagazzinoCaricoUnita | null {
  const v = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(",", ".");
  if (!v) return null;
  if (v === "kg" || v === "kgs" || v === "kilogrammi") return "kg";
  if (v === "g" || v === "gr" || v === "grammi" || v === "grammo") return "g";
  if (v === "lt" || v === "l" || v === "litro" || v === "litri") return "lt";
  if (v === "ml" || v === "millilitri") return "ml";
  if (v === "pz" || v === "pzs" || v === "nr" || v === "n" || v === "pezzi") {
    return "pz";
  }
  return isMagazzinoCaricoUnita(v) ? v : null;
}

export function unitaSchedaProdotto(opts: {
  schedaUm?: string | null;
  prodottoCodice?: string | null;
}): MagazzinoCaricoUnita {
  const fromScheda = parseUnitaCarico(opts.schedaUm);
  if (fromScheda) return fromScheda;
  const code = String(opts.prodottoCodice ?? "").toUpperCase();
  if (code.startsWith("OGL") || code.startsWith("NGL")) return "lt";
  return "kg";
}

export function unitaStockDaCarico(
  um: MagazzinoCaricoUnita
): "kg" | "lt" | "pz" {
  if (um === "g" || um === "kg") return "kg";
  if (um === "ml" || um === "lt") return "lt";
  return "pz";
}

export function quantitaStockDaCarico(
  quantita: number,
  um: MagazzinoCaricoUnita
): number {
  const raw = um === "g" || um === "ml" ? quantita / 1000 : quantita;
  return Math.round(raw * 1000) / 1000;
}

export function formatQuantitaCarico(
  quantitaStock: number,
  um: MagazzinoCaricoUnita
): string {
  const q = um === "g" || um === "ml" ? quantitaStock * 1000 : quantitaStock;
  const label = um === "g" ? "g" : um;
  return `${q.toLocaleString("it-IT")} ${label}`;
}

export const movimentoManualeSchema = z
  .object({
    prodottoId: z.string().uuid("Seleziona un prodotto"),
    quantita: z.number().positive("Quantità maggiore di zero"),
    unitaMisura: z.enum(MAGAZZINO_CARICO_UNITA),
    lottoCodice: z
      .string()
      .trim()
      .min(1, "Lotto obbligatorio")
      .max(120)
      .refine(
        (v) => isValidLottoAgrinsicilia(v),
        "Lotto non valido. Apri la composizione (L-data/targa/fornitore/codice MP-nnn)."
      ),
    collegaFoglio: z.boolean(),
    foglioId: z.string().uuid().nullable().optional(),
    motivoSenzaFoglio: z.enum(MOTIVO_SENZA_FOGLIO).nullable().optional(),
    note: z.string().trim().max(1000).optional().default(""),
  })
  .superRefine((val, ctx) => {
    if (val.collegaFoglio && !val.foglioId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Seleziona il foglio di lavorazione.",
        path: ["foglioId"],
      });
    }
    if (!val.collegaFoglio && !val.motivoSenzaFoglio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica il motivo del bypass (inventario o rivisita ordine).",
        path: ["motivoSenzaFoglio"],
      });
    }
    if (!val.collegaFoglio && !val.note.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "In bypass il dettaglio della motivazione è obbligatorio.",
        path: ["note"],
      });
    }
  });

export type MovimentoManualeInput = z.infer<typeof movimentoManualeSchema>;

export type FoglioApertoOption = {
  id: string;
  codice: string;
  prodotto: string;
  lottoLabel: string;
  stato: "aperto" | "chiuso";
};

export type MovimentoAgrinsiciliaRiga = {
  id: string;
  createdAt: string;
  prodottoCodice: string;
  quantitaKg: number;
  unita: MagazzinoCaricoUnita;
  lottoCodice: string;
  foglioCodice: string | null;
  motivoSenzaFoglio: MotivoSenzaFoglio | null;
  note: string;
};
