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
};

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
