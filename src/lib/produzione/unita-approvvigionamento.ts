import { UNITA_MATERIA_PRIMA } from "@/lib/amministrazione/materie-prime";

/** Sigle già usate da anagrafica materie prime e dal magazzino. Non se ne creano copie. */
const SIGLE_MAGAZZINO = new Set<string>(UNITA_MATERIA_PRIMA);

export const UNITA_APPROVVIGIONAMENTO = [
  { sigla: "pz", etichetta: "Pz — Pezzi", magazzino: true },
  { sigla: "kg", etichetta: "Kg — Chilogrammi", magazzino: true },
  { sigla: "g", etichetta: "g — Grammi", magazzino: true },
  { sigla: "t", etichetta: "t — Tonnellate", magazzino: false },
  { sigla: "lt", etichetta: "Lt — Litri", magazzino: true },
  { sigla: "ml", etichetta: "ml — Millilitri", magazzino: true },
  { sigla: "m", etichetta: "m — Metri", magazzino: false },
  { sigla: "cm", etichetta: "cm — Centimetri", magazzino: false },
  { sigla: "m²", etichetta: "m² — Metri quadrati", magazzino: false },
  { sigla: "m³", etichetta: "m³ — Metri cubi", magazzino: false },
  { sigla: "conf", etichetta: "Conf. — Confezioni", magazzino: false },
  { sigla: "sacchi", etichetta: "Sacchi", magazzino: false },
  { sigla: "colli", etichetta: "Colli", magazzino: false },
  { sigla: "bancali", etichetta: "Bancali", magazzino: false },
] as const;

export type SiglaApprovvigionamento = (typeof UNITA_APPROVVIGIONAMENTO)[number]["sigla"];

const PER_SIGLA = new Map(UNITA_APPROVVIGIONAMENTO.map((voce) => [voce.sigla, voce]));

const ALIAS: Record<string, SiglaApprovvigionamento> = {
  pz: "pz",
  pezzi: "pz",
  pezzo: "pz",
  nr: "pz",
  kg: "kg",
  chilogrammi: "kg",
  chilogrammo: "kg",
  g: "g",
  gr: "g",
  grammi: "g",
  grammo: "g",
  t: "t",
  tonnellate: "t",
  tonnellata: "t",
  lt: "lt",
  l: "lt",
  litri: "lt",
  litro: "lt",
  ml: "ml",
  millilitri: "ml",
  millilitro: "ml",
  m: "m",
  metri: "m",
  metro: "m",
  cm: "cm",
  centimetri: "cm",
  centimetro: "cm",
  "m²": "m²",
  m2: "m²",
  mq: "m²",
  "m³": "m³",
  m3: "m³",
  mc: "m³",
  conf: "conf",
  "conf.": "conf",
  confezioni: "conf",
  confezione: "conf",
  sacchi: "sacchi",
  sacco: "sacchi",
  colli: "colli",
  collo: "colli",
  bancali: "bancali",
  bancale: "bancali",
};

export function unitaMagazzinoCompatibile(sigla: string): boolean {
  return SIGLE_MAGAZZINO.has(sigla);
}

export function unitaStandard(sigla: string): boolean {
  return PER_SIGLA.has(sigla as SiglaApprovvigionamento);
}

/** Riporta alla sigla già nota. Non converte la quantità. */
export function normalizzaUnitaApprovvigionamento(
  valore: string
): { ok: true; sigla: string; magazzino: boolean } | { ok: false; motivo: string } {
  const testo = valore.trim();
  if (!testo || testo.length > 16 || /[,;\n\r]/.test(testo)) {
    return { ok: false, motivo: "Unità non prevista." };
  }
  const alias = ALIAS[testo.toLowerCase()];
  if (alias) {
    const nota = PER_SIGLA.get(alias);
    return { ok: true, sigla: alias, magazzino: nota?.magazzino ?? false };
  }
  if (!/^[\p{L}\p{N}.²³]{1,16}$/u.test(testo)) {
    return { ok: false, motivo: "Unità non prevista." };
  }
  return { ok: true, sigla: testo, magazzino: false };
}

export function etichettaUnita(sigla: string, nome?: string | null): string {
  const normale = normalizzaUnitaApprovvigionamento(sigla);
  const canonica = normale.ok ? normale.sigla : sigla.trim();
  const nota = PER_SIGLA.get(canonica as SiglaApprovvigionamento);
  if (nota) return nota.etichetta.split(" — ")[0] ?? nota.sigla;
  const titolo = (nome ?? "").trim();
  if (titolo) return `${titolo} (${canonica})`;
  return canonica;
}

export function etichettaMeseAnno(iso: string): string {
  const mesi = [
    "GENNAIO",
    "FEBBRAIO",
    "MARZO",
    "APRILE",
    "MAGGIO",
    "GIUGNO",
    "LUGLIO",
    "AGOSTO",
    "SETTEMBRE",
    "OTTOBRE",
    "NOVEMBRE",
    "DICEMBRE",
  ];
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return "";
  const mese = mesi[Number(match[2]) - 1];
  if (!mese) return "";
  return `${mese} ${match[1]}`;
}
