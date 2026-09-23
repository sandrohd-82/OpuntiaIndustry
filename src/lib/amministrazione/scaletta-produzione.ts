import { z } from "zod";

export const SCALETTA_VISTE = ["mese", "settimana", "giorno"] as const;
export type ScalettaVista = (typeof SCALETTA_VISTE)[number];

export const SCALETTA_TIPI_IMPEGNO = [
  "lavorazione",
  "confezionamento",
  "attivita",
  "trasformazione",
  "altro",
] as const;
export type ScalettaTipoImpegno = (typeof SCALETTA_TIPI_IMPEGNO)[number];

export const SCALETTA_TIPO_LABEL: Record<ScalettaTipoImpegno, string> = {
  lavorazione: "Lavorazione",
  confezionamento: "Confezionamento",
  attivita: "Attività",
  trasformazione: "Trasformazione",
  altro: "Altro",
};

export const SCALETTA_ESECUZIONE_STATI = [
  "aperta",
  "completata",
  "problema",
  "pronto_ritiro",
] as const;
export type ScalettaEsecuzioneStato =
  (typeof SCALETTA_ESECUZIONE_STATI)[number];

export const SCALETTA_ESECUZIONE_LABEL: Record<
  ScalettaEsecuzioneStato,
  string
> = {
  aperta: "Da eseguire",
  completata: "Completata",
  problema: "Problema",
  pronto_ritiro: "Pronto per il ritiro",
};

export type ScalettaImpegno = {
  id: string;
  dataGiorno: string;
  tipo: ScalettaTipoImpegno;
  etichetta: string;
  numeroInterno: string;
  cliente: string;
  prodotto: string;
  entityType: "ordine" | "campionatura";
  entityId: string;
  lineaCodice: string | null;
  esecuzioneStato: ScalettaEsecuzioneStato;
  problemaNote: string;
};

export type ScalettaDettaglioRiga = {
  prodottoCodice: string;
  prodottoNome: string;
  quantita: number;
  unitaMisura: string;
  lottoCodice: string;
  processo: string;
  conforme: boolean | null;
};

export type ScalettaDettaglio = {
  impegno: {
    id: string;
    dataGiorno: string;
    tipo: ScalettaTipoImpegno;
    etichetta: string;
    lineaCodice: string | null;
    esecuzioneStato: ScalettaEsecuzioneStato;
    problemaNote: string;
    esitoNote: string;
    eseguitaAt: string | null;
    problemaAt: string | null;
  };
  documento: {
    entityType: "ordine" | "campionatura";
    entityId: string;
    numeroInterno: string;
    cliente: string;
    stato: string;
    documentoStato: string;
    versione: number;
    dataDocumento: string;
    dataConsegna: string | null;
    destinatario: string;
    indirizzo: string;
    trackingUrl: string;
    note: string;
    urgente: boolean;
    usaMagazzino: boolean;
    tipo: string;
    sedePartenzaId: string;
    sedePartenzaLabel: string;
  };
  righe: ScalettaDettaglioRiga[];
  processazione: {
    dataLavorazione: string;
    dataConfezionamento: string;
    giorniProduzione: string[];
    pack: string[];
    fonte: string;
    extra: string[];
  };
};

export function parseEsecuzioneStato(
  raw: unknown
): ScalettaEsecuzioneStato {
  const v = String(raw ?? "aperta");
  return (SCALETTA_ESECUZIONE_STATI as readonly string[]).includes(v)
    ? (v as ScalettaEsecuzioneStato)
    : "aperta";
}

export const scalettaEsitoSchema = z.object({
  impegnoId: z.string().uuid(),
  modo: z.enum(["completa", "problema", "pronto_ritiro"]),
  nota: z.string().trim().max(4000).optional().default(""),
  sedePartenzaId: z.string().uuid().nullable().optional(),
});

export type ScalettaSenzaData = {
  entityType: "ordine" | "campionatura";
  entityId: string;
  numeroInterno: string;
  cliente: string;
  prodotto: string;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const passaCampionaturaScalettaSchema = z.object({
  campionaturaId: z.string().uuid(),
  dataLavorazione: isoDate,
  dataConfezionamento: isoDate,
  righe: z
    .array(
      z.object({
        rigaId: z.string().uuid(),
        lottoInternoCodice: z.string().trim().min(1).max(80),
        lottoProdottoId: z.string().uuid(),
        lottoProdottoCodice: z.string().trim().min(1).max(80),
        conforme: z.boolean(),
        processoId: z.string().uuid().nullable().optional(),
        processoCodice: z.string().trim().max(80).optional().default(""),
        processoNome: z.string().trim().max(200).optional().default(""),
      })
    )
    .min(1),
  pack: z
    .object({
      movimentazioneId: z.string().uuid().nullable().optional(),
      confezioneId: z.string().uuid().nullable().optional(),
      isolamentoId: z.string().uuid().nullable().optional(),
    })
    .optional(),
  sedePartenzaId: z.string().uuid().nullable().optional(),
});

export type PassaCampionaturaScalettaInput = z.infer<
  typeof passaCampionaturaScalettaSchema
>;

export function tipoImpegnoDaNote(note: string): ScalettaTipoImpegno {
  const n = note.trim().toLowerCase();
  if (n.startsWith("lavorazione")) return "lavorazione";
  if (n.startsWith("confezionamento")) return "confezionamento";
  if (n.startsWith("trasformazione")) return "trasformazione";
  if (n.startsWith("attivita") || n === "attivita") return "attivita";
  return "altro";
}
