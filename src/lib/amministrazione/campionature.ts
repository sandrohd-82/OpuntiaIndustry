import { z } from "zod";

export const CAMPIONATURA_STATI = [
  "bozza",
  "inviata",
  "consegnata",
  "annullata",
] as const;

export const CAMPIONATURA_UM = ["g", "kg", "pz", "ml"] as const;

export type CampionaturaStato = (typeof CAMPIONATURA_STATI)[number];
export type CampionaturaUm = (typeof CAMPIONATURA_UM)[number];

export type CampionaturaRiga = {
  id: string;
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantita: number;
  unitaMisura: CampionaturaUm;
  lottoCodice: string;
  note: string;
};

export type Campionatura = {
  id: string;
  numeroInterno: string;
  clienteId: string;
  cliente: string;
  clienteCodiceTarga: string;
  dataInvio: string;
  destinatario: string;
  indirizzoSpedizione: string;
  note: string;
  stato: CampionaturaStato;
  documentoStato: "bozza" | "approvato" | "chiuso";
  versione: number;
  approvedAt: string | null;
  sentAt: string | null;
  righe: CampionaturaRiga[];
  createdAt: string;
  updatedAt: string;
};

export const campionaturaRigaSchema = z.object({
  prodottoId: z.string().uuid("Seleziona un prodotto"),
  prodottoCodice: z.string().trim().min(1),
  prodottoNome: z.string().trim().min(1),
  quantita: z.number().positive("Quantità maggiore di zero"),
  unitaMisura: z.enum(CAMPIONATURA_UM),
  lottoCodice: z.string().trim().min(1, "Indica il lotto"),
  note: z.string().trim().max(500).optional().default(""),
});

export const createCampionaturaSchema = z.object({
  clienteId: z.string().uuid("Seleziona un’azienda"),
  cliente: z.string().trim().min(1),
  codiceTargaCliente: z.string().trim().min(1),
  dataInvio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invio obbligatoria"),
  destinatario: z.string().trim().max(200).optional().default(""),
  indirizzoSpedizione: z.string().trim().max(500).optional().default(""),
  note: z.string().trim().max(4000).optional().default(""),
  righe: z.array(campionaturaRigaSchema).min(1, "Aggiungi almeno un prodotto"),
});

export type CreateCampionaturaInput = z.infer<typeof createCampionaturaSchema>;

export function formatNumeroCampionatura(
  dataInvio: string,
  targa: string,
  seq: number
): string {
  const yy = dataInvio.slice(2, 4) || String(new Date().getFullYear()).slice(2);
  const code = targa.trim().toUpperCase().replace(/\s+/g, "");
  return `Cp-${yy}-${code}/${seq}`;
}

export const CAMPIONATURA_STATO_LABEL: Record<CampionaturaStato, string> = {
  bozza: "Bozza",
  inviata: "Inviata",
  consegnata: "Consegnata",
  annullata: "Annullata",
};

export function formatIndirizzoSede(sede: {
  indirizzo?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  nazione?: string;
}): string {
  return [sede.indirizzo, sede.cap, sede.citta, sede.provincia, sede.nazione]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function emptyCampionaturaRiga(): Omit<CampionaturaRiga, "id"> {
  return {
    prodottoId: "",
    prodottoCodice: "",
    prodottoNome: "",
    quantita: 0,
    unitaMisura: "g",
    lottoCodice: "",
    note: "",
  };
}
