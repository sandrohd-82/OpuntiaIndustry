export type EssiccatorePower = "acceso" | "spento";

/** Fase operativa dell'essiccatore */
export type EssiccatoreFase =
  | "spento"
  | "avvio"
  | "essiccazione"
  | "asciugatura_notturna"
  | "spegnimento"
  | "raffreddamento"
  | "partenza"
  | "girata";

/** Condizione termica dello stato */
export type EssiccatoreCondizione = "regolare" | "hot" | "cold";

export type MescolataCompletata = {
  id: string;
  /** Timestamp fine processo mescolata */
  endedAt: string;
  /** Esito tempo impiegato: verde / giallo / rosso */
  esitoTone: "perfetto" | "sopra_media" | "troppo_lungo";
  /** Nota obbligatoria se esito rosso (troppo lungo) */
  motivoNota: string | null;
};

export type ProdottoMovimento = {
  id: string;
  /** Quantità con segno (+ carico / − scarico) */
  deltaKg: number;
  /** Timestamp registrazione */
  at: string;
};

export type Essiccatore = {
  id: string;
  name: string;
  power: EssiccatorePower;
  imageSrc: string;
  fase: EssiccatoreFase;
  condizione: EssiccatoreCondizione;
  temperaturaImpostataC: number | null;
  temperaturaRilevataC: number | null;
  /** Ultimo aggiornamento temperatura rilevata */
  temperaturaAggiornataIl: string | null;
  /** Timestamp di accensione (null se spento) */
  accesoDal: string | null;
  /** Totale prodotto caricato (kg), parte da 0 */
  prodottoCaricatoKg: number;
  /** Obiettivo kg prodotto fresco da raggiungere (impostato in Avvio) */
  prodottoObiettivoKg: number | null;
  /** Storico movimenti prodotto */
  prodottoMovimenti: ProdottoMovimento[];
  /** Ventilazione impostata (0–100%) */
  ventilazionePercent: number;
  /** Storico mescolate completate (una pala per ciascuna) */
  mescolateCompletate: MescolataCompletata[];
};

export const FASE_LABELS: Record<EssiccatoreFase, string> = {
  spento: "Spento",
  avvio: "Avvio",
  essiccazione: "Essiccazione",
  asciugatura_notturna: "Asciugatura notturna",
  spegnimento: "Spegnimento",
  raffreddamento: "Raffreddamento",
  partenza: "Partenza",
  girata: "Girata",
};

export const CONDIZIONE_LABELS: Record<EssiccatoreCondizione, string> = {
  regolare: "Regolare",
  hot: "Hot",
  cold: "Cold",
};

export const PRODOTTO_STIMA_PERCENT = 7.5;

const TEMP_TOLERANCE_C = 5;

/** Verde ±5° rispetto all'impostata, rosso sopra, azzurro sotto */
export function temperaturaTone(
  impostata: number | null,
  rilevata: number | null
): EssiccatoreCondizione | null {
  if (impostata === null || rilevata === null) return null;
  const delta = rilevata - impostata;
  if (delta > TEMP_TOLERANCE_C) return "hot";
  if (delta < -TEMP_TOLERANCE_C) return "cold";
  return "regolare";
}

/** ±7,5% del prodotto caricato */
export function prodottoStimatoDeltaKg(caricatoKg: number): number {
  return (caricatoKg * PRODOTTO_STIMA_PERCENT) / 100;
}

/** Dati demo — spenti finché non collegati ad azioni salvate in DB */
export const ESSICCATORI: Essiccatore[] = [
  {
    id: "ess-1",
    name: "Essiccatore 1",
    power: "spento",
    imageSrc: "/essiccatori/essiccatore-1.jpg",
    fase: "spento",
    condizione: "regolare",
    temperaturaImpostataC: null,
    temperaturaRilevataC: null,
    temperaturaAggiornataIl: null,
    accesoDal: null,
    prodottoCaricatoKg: 0,
    prodottoObiettivoKg: null,
    prodottoMovimenti: [],
    ventilazionePercent: 0,
    mescolateCompletate: [],
  },
  {
    id: "ess-2",
    name: "Essiccatore 2",
    power: "spento",
    imageSrc: "/essiccatori/essiccatore-2.jpg",
    fase: "spento",
    condizione: "regolare",
    temperaturaImpostataC: null,
    temperaturaRilevataC: null,
    temperaturaAggiornataIl: null,
    accesoDal: null,
    prodottoCaricatoKg: 0,
    prodottoObiettivoKg: null,
    prodottoMovimenti: [],
    ventilazionePercent: 0,
    mescolateCompletate: [],
  },
  {
    id: "ess-3",
    name: "Essiccatore di Mantenimento",
    power: "spento",
    imageSrc: "/essiccatori/essiccatore-mantenimento.jpg",
    fase: "spento",
    condizione: "regolare",
    temperaturaImpostataC: null,
    temperaturaRilevataC: null,
    temperaturaAggiornataIl: null,
    accesoDal: null,
    prodottoCaricatoKg: 0,
    prodottoObiettivoKg: null,
    prodottoMovimenti: [],
    ventilazionePercent: 0,
    mescolateCompletate: [],
  },
];
