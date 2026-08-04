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

export type Essiccatore = {
  id: string;
  name: string;
  power: EssiccatorePower;
  imageSrc: string;
  fase: EssiccatoreFase;
  condizione: EssiccatoreCondizione;
  temperaturaImpostataC: number | null;
  temperaturaRilevataC: number | null;
  /** Timestamp di accensione (null se spento) */
  accesoDal: string | null;
  prodottoCaricatoKg: number;
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
    accesoDal: new Date(Date.now() - 14.5 * 60 * 60 * 1000).toISOString(),
    prodottoCaricatoKg: 2153,
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
    accesoDal: new Date(Date.now() - 9.2 * 60 * 60 * 1000).toISOString(),
    prodottoCaricatoKg: 1840,
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
    accesoDal: null,
    prodottoCaricatoKg: 0,
  },
];
