import { z } from "zod";
import type { Cliente } from "@/lib/amministrazione/clienti";

export const CAMPIONATURA_STATI = [
  "bozza",
  "inviata",
  "consegnata",
  "annullata",
] as const;

export const CAMPIONATURA_UM = ["g", "kg", "pz", "ml"] as const;

export const CAMPIONATURA_MEZZI = [
  "mail",
  "messaggio",
  "chiamata",
  "in_presenza",
] as const;

export type CampionaturaStato = (typeof CAMPIONATURA_STATI)[number];
export type CampionaturaUm = (typeof CAMPIONATURA_UM)[number];
export type CampionaturaMezzo = (typeof CAMPIONATURA_MEZZI)[number];

export const CAMPIONATURA_MEZZO_LABEL: Record<CampionaturaMezzo, string> = {
  mail: "Mail",
  messaggio: "Messaggio",
  chiamata: "Chiamata",
  in_presenza: "In presenza",
};

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
  mezzo: CampionaturaMezzo | null;
  pnNotaId: string | null;
  pnNotaTitolo: string;
  webmailMessaggioId: string | null;
  webmailOggetto: string;
  spedizioneTipo: "sede_azienda" | "altro_posto";
  spedizionePrivato: boolean;
  referenteRicezioneId: string | null;
  referenteRicezioneLabel: string;
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
  dataInvio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data richiesta obbligatoria"),
  mezzo: z.enum(CAMPIONATURA_MEZZI, { message: "Indica a mezzo di" }),
  pnNotaId: z.string().uuid("Collega o crea una nota della timeline"),
  webmailMessaggioId: z.string().uuid().nullable().optional().default(null),
  spedizioneTipo: z
    .enum(["sede_azienda", "altro_posto"])
    .optional()
    .default("sede_azienda"),
  spedizionePrivato: z.boolean().optional().default(false),
  referenteRicezioneId: z.string().uuid().nullable().optional().default(null),
  destinatario: z.string().trim().max(200).optional().default(""),
  indirizzoSpedizione: z.string().trim().max(500).optional().default(""),
  note: z.string().trim().max(4000).optional().default(""),
  righe: z.array(campionaturaRigaSchema).min(1, "Aggiungi almeno un prodotto"),
});

export type CreateCampionaturaInput = z.infer<typeof createCampionaturaSchema>;

export const createReferenteRicezioneSchema = z.object({
  clienteId: z.string().uuid(),
  clienteLabel: z.string().trim().min(1),
  isPrivato: z.boolean(),
  ragioneSociale: z.string().trim().max(200).optional().default(""),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(80),
  cognome: z.string().trim().min(1, "Cognome obbligatorio").max(80),
  telefono: z.string().trim().max(60).optional().default(""),
  email: z.string().trim().max(120).optional().default(""),
  indirizzo: z.string().trim().min(1, "Indirizzo obbligatorio").max(500),
});

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

export type SpedizioneOption = {
  key: string;
  label: string;
  destinatario: string;
  indirizzo: string;
};

export function clienteSpedizioneOptions(cliente: Cliente): SpedizioneOption[] {
  const out: SpedizioneOption[] = [];
  const amm = formatIndirizzoSede(cliente.sedeAmministrativa);
  if (amm) {
    out.push({
      key: "amm",
      label: "Sede amministrativa",
      destinatario: cliente.ragioneSociale,
      indirizzo: amm,
    });
  }
  const mag = formatIndirizzoSede(cliente.sedeMagazzino);
  if (mag && mag !== amm) {
    out.push({
      key: "mag",
      label: "Sede magazzino",
      destinatario: cliente.ragioneSociale,
      indirizzo: mag,
    });
  }
  cliente.consegneAltraAzienda.forEach((c, i) => {
    const addr = formatIndirizzoSede(c);
    if (!addr) return;
    out.push({
      key: `consegna-${i}`,
      label: c.ragioneSociale.trim()
        ? `Consegna: ${c.ragioneSociale}`
        : `Altro indirizzo ${i + 1}`,
      destinatario: c.ragioneSociale.trim() || cliente.ragioneSociale,
      indirizzo: addr,
    });
  });
  return out;
}

export const REFERENTE_RICEZIONE_MERCE = "Ricezione merce";

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
