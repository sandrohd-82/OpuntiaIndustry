/** Catalogo impianti essiccatori installati (Action). Persistenza IoT in seguito. */

export type EssiccatoreCaricoTipo = "fresco" | "semisecco";

export type ActionEssiccatore = {
  id: string;
  codice: string;
  nome: string;
  capacitaMaxKg: number;
  caricoTipo: EssiccatoreCaricoTipo;
  note: string;
  imageSrc: string;
};

export const CARICO_TIPO_LABELS: Record<EssiccatoreCaricoTipo, string> = {
  fresco: "Fresco",
  semisecco: "Semisecco",
};

export const ACTION_ESSICCATORI: readonly ActionEssiccatore[] = [
  {
    id: "ess-a",
    codice: "ESS-A",
    nome: "Essiccatore A",
    capacitaMaxKg: 2300,
    caricoTipo: "fresco",
    note: "",
    imageSrc: "/essiccatori/EssiccatoreA-Hover.pdf",
  },
  {
    id: "ess-b",
    codice: "ESS-B",
    nome: "Essiccatore B",
    capacitaMaxKg: 2300,
    caricoTipo: "fresco",
    note: "",
    imageSrc: "/essiccatori/EssiccatoreB-Hover.jpg.pdf",
  },
  {
    id: "ess-ultimo-stadio",
    codice: "ESS-US",
    nome: "Essiccatore Ultimo Stadio",
    capacitaMaxKg: 1500,
    caricoTipo: "semisecco",
    note: "In 3 cestoni da 500 kg impilati",
    imageSrc: "/essiccatori/EssiccatoreUlSt-Hover.jpg.pdf",
  },
];

export const ACTION_ESSICCATORE_IDS = ACTION_ESSICCATORI.map(
  (e) => e.id
) as [string, ...string[]];

export function formatCapacitaKg(kg: number): string {
  return `${kg.toLocaleString("it-IT")} kg`;
}
