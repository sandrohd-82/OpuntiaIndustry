import { z } from "zod";

export const PRESENZE_STATI = [
  "presente",
  "uscito",
  "assente",
  "anomalia",
] as const;

export type PresenzaStato = (typeof PRESENZE_STATI)[number];

export type PresenzaGiorno = {
  id: string;
  giorno: string;
  matchKey: string;
  dipendenteEsternoId: string;
  nome: string;
  cognome: string;
  nomeCompleto: string;
  codiceFiscale: string;
  personaId: string | null;
  ingressoAt: string | null;
  uscitaAt: string | null;
  minutiLavorati: number;
  stato: PresenzaStato;
  lastSyncedAt: string;
};

export const listPresenzeSchema = z.object({
  giorno: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida")
    .optional(),
});

export function presenzaMatchKey(opts: {
  codiceFiscale: string;
  dipendenteEsternoId: string;
}): string {
  const cf = opts.codiceFiscale.trim().toUpperCase().replace(/\s+/g, "");
  if (cf) return `cf:${cf}`;
  const ext = opts.dipendenteEsternoId.trim();
  if (ext) return `ext:${ext}`;
  return `anon:${crypto.randomUUID()}`;
}

export function computeMinuti(
  ingressoAt: string | null,
  uscitaAt: string | null,
  fallback: number | null
): number {
  if (ingressoAt && uscitaAt) {
    const a = new Date(ingressoAt).getTime();
    const b = new Date(uscitaAt).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      return Math.round((b - a) / 60000);
    }
  }
  if (fallback != null && Number.isFinite(fallback) && fallback >= 0) {
    return Math.round(fallback);
  }
  return 0;
}

export function computeStato(opts: {
  ingressoAt: string | null;
  uscitaAt: string | null;
}): PresenzaStato {
  const { ingressoAt, uscitaAt } = opts;
  if (!ingressoAt && !uscitaAt) return "assente";
  if (ingressoAt && uscitaAt) {
    const a = new Date(ingressoAt).getTime();
    const b = new Date(uscitaAt).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "anomalia";
    return "uscito";
  }
  if (ingressoAt && !uscitaAt) return "presente";
  return "anomalia";
}

export function presenzaStatoLabel(stato: PresenzaStato): string {
  if (stato === "presente") return "Presente";
  if (stato === "uscito") return "Uscito";
  if (stato === "assente") return "Assente";
  return "Anomalia";
}

export function formatOraIt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatOreMinuti(minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  if (rest === 0) return `${h} h`;
  return `${h} h ${rest} min`;
}

export function summarizePresenze(items: PresenzaGiorno[]): {
  presenti: number;
  usciti: number;
  assenti: number;
  anomalie: number;
  minutiTotali: number;
} {
  let presenti = 0;
  let usciti = 0;
  let assenti = 0;
  let anomalie = 0;
  let minutiTotali = 0;
  for (const row of items) {
    minutiTotali += row.minutiLavorati;
    if (row.stato === "presente") presenti += 1;
    else if (row.stato === "uscito") usciti += 1;
    else if (row.stato === "assente") assenti += 1;
    else anomalie += 1;
  }
  return { presenti, usciti, assenti, anomalie, minutiTotali };
}
