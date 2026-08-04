export type EssiccatoreStatus = "acceso" | "spento";

export type Essiccatore = {
  id: string;
  name: string;
  status: EssiccatoreStatus;
  imageSrc: string;
  /** Dati di esercizio (mock finché non collegati a telemetria/DB) */
  esercizio: {
    temperaturaCameraC: number | null;
    umiditaPercent: number | null;
    setPointC: number | null;
    oreCiclo: number | null;
    caricoKg: number | null;
    cicloCorrente: string | null;
    ultimoAggiornamento: string;
    note: string | null;
  };
};

/** Dati demo — sostituibili con lettura live da backend/sensori */
export const ESSICCATORI: Essiccatore[] = [
  {
    id: "ess-1",
    name: "Essiccatore 1",
    status: "acceso",
    imageSrc: "/essiccatori/essiccatore-1.jpg",
    esercizio: {
      temperaturaCameraC: 62.4,
      umiditaPercent: 28,
      setPointC: 65,
      oreCiclo: 14.5,
      caricoKg: 1850,
      cicloCorrente: "Essiccazione standard",
      ultimoAggiornamento: new Date().toISOString(),
      note: "Ciclo in corso, ventilazione automatica attiva.",
    },
  },
  {
    id: "ess-2",
    name: "Essiccatore 2",
    status: "acceso",
    imageSrc: "/essiccatori/essiccatore-2.jpg",
    esercizio: {
      temperaturaCameraC: 58.1,
      umiditaPercent: 34,
      setPointC: 60,
      oreCiclo: 9.2,
      caricoKg: 1620,
      cicloCorrente: "Pre-essiccazione",
      ultimoAggiornamento: new Date().toISOString(),
      note: null,
    },
  },
  {
    id: "ess-3",
    name: "Essiccatore di Mantenimento",
    status: "spento",
    imageSrc: "/essiccatori/essiccatore-mantenimento.jpg",
    esercizio: {
      temperaturaCameraC: 22.0,
      umiditaPercent: 48,
      setPointC: null,
      oreCiclo: 0,
      caricoKg: 0,
      cicloCorrente: null,
      ultimoAggiornamento: new Date().toISOString(),
      note: "In standby — disponibile per carico di mantenimento.",
    },
  },
];
