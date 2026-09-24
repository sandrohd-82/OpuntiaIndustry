import { z } from "zod";

export const SCONTO_FASCE = [
  "nessuno",
  "fino_10",
  "da_10_a_20",
  "da_20_a_30",
  "oltre_30",
] as const;
export type ScontoFascia = (typeof SCONTO_FASCE)[number];

export function isScontoFascia(value: unknown): value is ScontoFascia {
  return (
    value === "nessuno" ||
    value === "fino_10" ||
    value === "da_10_a_20" ||
    value === "da_20_a_30" ||
    value === "oltre_30"
  );
}

export const SCONTO_APPROVAZIONE_STATI = [
  "non_richiesta",
  "in_attesa",
  "approvata",
  "rifiutata",
] as const;
export type ScontoApprovazioneStato = (typeof SCONTO_APPROVAZIONE_STATI)[number];

export const SCONTO_APPROVAZIONE_RUOLI = [
  "commerciale_senior",
  "superadmin",
] as const;
export type ScontoApprovazioneRuolo = (typeof SCONTO_APPROVAZIONE_RUOLI)[number];

export function parseScontoExtraPct(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

export function fasciaScontoExtra(pct: number): ScontoFascia {
  const n = parseScontoExtraPct(pct);
  if (n <= 0) return "nessuno";
  if (n <= 10) return "fino_10";
  if (n <= 20) return "da_10_a_20";
  if (n <= 30) return "da_20_a_30";
  return "oltre_30";
}

export function labelScontoFascia(fascia: ScontoFascia): string {
  switch (fascia) {
    case "fino_10":
      return "≤ 10%";
    case "da_10_a_20":
      return "10,01–20%";
    case "da_20_a_30":
      return "20,01–30%";
    case "oltre_30":
      return "> 30%";
    default:
      return "Nessuno";
  }
}

export function prezzoNettoDaSconto(
  prezzoListino: number,
  scontoExtraPct: number
): number {
  const lordo = Number.isFinite(prezzoListino) ? Math.max(0, prezzoListino) : 0;
  const extra = parseScontoExtraPct(scontoExtraPct);
  return Math.round(lordo * (1 - extra / 100) * 100) / 100;
}

export type ScontoRequisiti = {
  senior: boolean;
  superadmin: number;
  seniorOrSuperadmin: boolean;
};

export function requisitiApprovazioneSconto(
  fascia: ScontoFascia,
  opts?: { haSeniorLinea?: boolean; superadminTotali?: number }
): ScontoRequisiti {
  const haSenior = opts?.haSeniorLinea !== false;
  switch (fascia) {
    case "da_10_a_20":
      return { senior: false, superadmin: 0, seniorOrSuperadmin: true };
    case "da_20_a_30":
      return {
        senior: haSenior,
        superadmin: 1,
        seniorOrSuperadmin: false,
      };
    case "oltre_30":
      return {
        senior: false,
        superadmin: 2,
        seniorOrSuperadmin: false,
      };
    default:
      return { senior: false, superadmin: 0, seniorOrSuperadmin: false };
  }
}

export function scontoApprovazioneCompleta(input: {
  fascia: ScontoFascia;
  haSeniorLinea: boolean;
  superadminTotali: number;
  seniorOk: boolean;
  superadminOk: number;
}): boolean {
  const req = requisitiApprovazioneSconto(input.fascia, {
    haSeniorLinea: input.haSeniorLinea,
    superadminTotali: input.superadminTotali,
  });
  if (input.fascia === "nessuno" || input.fascia === "fino_10") return true;
  if (req.seniorOrSuperadmin) {
    return input.seniorOk || input.superadminOk >= 1;
  }
  if (req.senior && !input.seniorOk) return false;
  return input.superadminOk >= req.superadmin;
}

export function puoInserireScontoFascia(input: {
  fascia: ScontoFascia;
  isSuperadmin: boolean;
  isSenior: boolean;
}): boolean {
  if (input.fascia === "oltre_30") {
    return input.isSuperadmin || input.isSenior;
  }
  return true;
}

export const SCONTO_FUORI_LISTINO_TITOLO = "Sconto fuori listino";

export const SCONTO_FUORI_LISTINO_REGOLE = [
  {
    fascia: "≤ 10%",
    inserisce: "Chi ha Crea ordine o Crea preventivo.",
    approva: "Nessuna. Lo sconto è già valido.",
  },
  {
    fascia: "10,01–20%",
    inserisce: "Chi ha Crea ordine o Crea preventivo.",
    approva:
      "Un commerciale Senior della linea dell’azienda, oppure un Super Admin.",
  },
  {
    fascia: "20,01–30%",
    inserisce: "Chi ha Crea ordine o Crea preventivo.",
    approva:
      "Il commerciale Senior della linea e almeno un Super Admin. Se l’azienda non ha commerciale, basta un Super Admin.",
  },
  {
    fascia: "> 30%",
    inserisce: "Solo commerciale Senior (o Super Admin).",
    approva: "Entrambi i Super Admin.",
  },
] as const;

export const scontoExtraPctSchema = z
  .number()
  .min(0)
  .max(100)
  .optional()
  .default(0);
