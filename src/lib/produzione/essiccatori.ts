export type EssiccatorePower = "acceso" | "spento";

/** Fase operativa dell'essiccatore */
export type EssiccatoreFase =
  | "essiccazione"
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
  prodottoCaricatoKg: number;
  /** Ventilazione impostata (0–100%) */
  ventilazionePercent: number;
  /** Storico mescolate completate (una pala per ciascuna) */
  mescolateCompletate: MescolataCompletata[];
};

export const FASE_LABELS: Record<EssiccatoreFase, string> = {
  essiccazione: "Essiccazione",
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

/** Dati demo — sostituibili con lettura live da backend/sensori */
export const ESSICCATORI: Essiccatore[] = [
  {
    id: "ess-1",
    name: "Essiccatore 1",
    power: "acceso",
    imageSrc: "/essiccatori/essiccatore-1.jpg",
    fase: "essiccazione",
    condizione: "regolare",
    temperaturaImpostataC: 65,
    temperaturaRilevataC: 62.4,
    temperaturaAggiornataIl: new Date().toISOString(),
    accesoDal: new Date(Date.now() - (16 * 60 + 37) * 60 * 1000).toISOString(),
    prodottoCaricatoKg: 2153,
    ventilazionePercent: 72,
    mescolateCompletate: [],
  },
  {
    id: "ess-2",
    name: "Essiccatore 2",
    power: "acceso",
    imageSrc: "/essiccatori/essiccatore-2.jpg",
    fase: "girata",
    condizione: "hot",
    temperaturaImpostataC: 60,
    temperaturaRilevataC: 68.5,
    temperaturaAggiornataIl: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    accesoDal: new Date(Date.now() - (9 * 60 + 12) * 60 * 1000).toISOString(),
    prodottoCaricatoKg: 1840,
    ventilazionePercent: 55,
    mescolateCompletate: [],
  },
  {
    id: "ess-3",
    name: "Essiccatore di Mantenimento",
    power: "spento",
    imageSrc: "/essiccatori/essiccatore-mantenimento.jpg",
    fase: "spegnimento",
    condizione: "cold",
    temperaturaImpostataC: 40,
    temperaturaRilevataC: 22.0,
    temperaturaAggiornataIl: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    accesoDal: null,
    prodottoCaricatoKg: 0,
    ventilazionePercent: 0,
    mescolateCompletate: [],
  },
];
