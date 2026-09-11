import { z } from "zod";

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

export const movimentoManualeSchema = z
  .object({
    prodottoId: z.string().uuid("Seleziona un prodotto"),
    quantita: z.number().positive("Quantità maggiore di zero"),
    unitaMisura: z.enum(["g", "kg"]),
    lottoCodice: z.string().trim().min(1, "Lotto obbligatorio").max(80),
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
  lottoCodice: string;
  foglioCodice: string | null;
  motivoSenzaFoglio: MotivoSenzaFoglio | null;
  note: string;
};
