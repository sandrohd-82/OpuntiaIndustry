import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import type { Profile } from "@/types/database";

export const PASSI_SERVER_SCHEDA = [
  "accesso",
  "query",
  "gemelli",
  "ilike",
  "url",
  "funzione",
  "note",
  "attenzioni",
  "timeline",
  "spedizioni",
] as const;

export type NomePassoServerScheda = (typeof PASSI_SERVER_SCHEDA)[number];

export type PassoServerScheda = {
  nome: NomePassoServerScheda;
  ms: number;
  righe: number | null;
};

export type TempiServerScheda = {
  totaleMs: number;
  passi: PassoServerScheda[];
};

const NOMI = new Set<string>(PASSI_SERVER_SCHEDA);

export function apriCronometroServer() {
  const totale = performance.now();
  const passi: PassoServerScheda[] = [];
  return {
    segna(nome: NomePassoServerScheda, inizio: number, righe?: number) {
      passi.push({
        nome,
        ms: Math.max(0, Math.round(performance.now() - inizio)),
        righe: righeFinite(righe),
      });
    },
    aggiungi(nome: NomePassoServerScheda, ms: number, righe?: number) {
      passi.push({
        nome,
        ms: Math.max(0, Math.round(ms)),
        righe: righeFinite(righe),
      });
    },
    chiudi(): TempiServerScheda {
      return {
        totaleMs: Math.max(0, Math.round(performance.now() - totale)),
        passi,
      };
    },
  };
}

function righeFinite(righe: number | undefined): number | null {
  if (typeof righe !== "number" || !Number.isFinite(righe)) return null;
  return Math.max(0, Math.round(righe));
}

export function normalizzaTempiServer(valore: unknown): TempiServerScheda | null {
  if (!valore || typeof valore !== "object") return null;
  const record = valore as Record<string, unknown>;
  const totale = record.totaleMs;
  if (typeof totale !== "number" || !Number.isFinite(totale)) return null;
  const passi: PassoServerScheda[] = [];
  if (Array.isArray(record.passi)) {
    for (const passo of record.passi) {
      if (!passo || typeof passo !== "object") continue;
      const riga = passo as Record<string, unknown>;
      if (typeof riga.nome !== "string" || !NOMI.has(riga.nome)) continue;
      if (typeof riga.ms !== "number" || !Number.isFinite(riga.ms)) continue;
      passi.push({
        nome: riga.nome as NomePassoServerScheda,
        ms: Math.max(0, Math.round(riga.ms)),
        righe: righeFinite(
          typeof riga.righe === "number" ? riga.righe : undefined
        ),
      });
      if (passi.length >= 16) break;
    }
  }
  return { totaleMs: Math.max(0, Math.round(totale)), passi };
}

export function includiTempiServer(
  visibile: boolean,
  tempi: TempiServerScheda
): { tempiServer: TempiServerScheda } | Record<string, never> {
  if (!visibile) return {};
  const puliti = normalizzaTempiServer(tempi);
  if (!puliti) return {};
  return { tempiServer: puliti };
}

export function tempiServerVisibili(auth: {
  profile: Profile;
  impersonating: boolean;
} | null): boolean {
  return Boolean(auth && isUnrestrictedSuperadmin(auth));
}

export function differenzaNonAttribuitaMs(
  browserMs: number | null,
  serverMs: number | null
): number | null {
  if (browserMs == null || serverMs == null) return null;
  return Math.max(0, Math.round(browserMs - serverMs));
}
