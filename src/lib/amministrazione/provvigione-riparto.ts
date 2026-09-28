import type { CommercialeGrado } from "@/lib/auth/commerciale";

export type NodoProvvigione = {
  userId: string;
  grado: CommercialeGrado | null;
  /** Percentuale propria del commerciale (monte del Senior). */
  pctPropria: number | null;
  /** Punti che il superiore gli ha ceduto. Vale sul Professional. */
  quotaDalSuperiorePct: number | null;
  superioreUserId: string | null;
};

export type QuotaProvvigione = {
  userId: string;
  pct: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function punti(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/**
 * Riparto sull'imponibile.
 * Senior da solo: tiene la sua percentuale.
 * Professional con quota dal Senior: il Senior tiene il monte meno la quota.
 * Intermediario Executive sotto quel Professional: la sua quota esce da quella del Professional.
 */
export function quoteProvvigioneVendita(input: {
  assegnato: NodoProvvigione | null;
  superiore: NodoProvvigione | null;
  intermediarioUserId?: string | null;
  intermediarioPct?: number | null;
  intermediarioParentUserId?: string | null;
}): QuotaProvvigione[] {
  const assegnato = input.assegnato;
  if (!assegnato) return [];

  const superiore = input.superiore;
  const quotaImpostata =
    assegnato.grado === "professional" &&
    superiore?.grado === "senior" &&
    assegnato.quotaDalSuperiorePct != null &&
    Number.isFinite(assegnato.quotaDalSuperiorePct);

  if (!quotaImpostata) {
    const propria = punti(assegnato.pctPropria);
    return propria > 0 ? [{ userId: assegnato.userId, pct: round2(propria) }] : [];
  }

  const pool = punti(superiore?.pctPropria);
  const quota = Math.min(punti(assegnato.quotaDalSuperiorePct), pool);
  let professionalPct = quota;
  const quote: QuotaProvvigione[] = [];

  const interId = input.intermediarioUserId?.trim() || "";
  const interPct = punti(input.intermediarioPct);
  if (
    interId &&
    interPct > 0 &&
    input.intermediarioParentUserId === assegnato.userId &&
    interId !== assegnato.userId
  ) {
    const ceduta = Math.min(interPct, professionalPct);
    professionalPct = round2(professionalPct - ceduta);
    if (ceduta > 0) quote.push({ userId: interId, pct: round2(ceduta) });
  }

  const seniorPct = round2(Math.max(0, pool - quota));
  if (superiore && seniorPct > 0) {
    quote.push({ userId: superiore.userId, pct: seniorPct });
  }
  if (professionalPct > 0) {
    quote.push({ userId: assegnato.userId, pct: round2(professionalPct) });
  }
  return quote;
}

export function validaQuotaDalSenior(input: {
  quota: number | null;
  poolSenior: number | null;
}): { ok: true } | { ok: false; error: string } {
  if (input.quota == null) return { ok: true };
  if (!Number.isFinite(input.quota) || input.quota < 0 || input.quota > 100) {
    return { ok: false, error: "La quota dal Senior deve essere tra 0 e 100." };
  }
  const pool = input.poolSenior;
  if (pool == null || !Number.isFinite(pool)) {
    return {
      ok: false,
      error: "Il Senior non ha una provvigione: non si può cedere una quota.",
    };
  }
  if (input.quota > pool) {
    return {
      ok: false,
      error: `La quota non può superare il ${pool}% del Senior.`,
    };
  }
  return { ok: true };
}

export function validaQuotaIntermediario(input: {
  pct: number | null;
  haIntermediario: boolean;
  quotaProfessional: number | null;
}): { ok: true } | { ok: false; error: string } {
  if (!input.haIntermediario && (input.pct == null || input.pct === 0)) {
    return { ok: true };
  }
  if (!input.haIntermediario) {
    return {
      ok: false,
      error: "Indica l'intermediario a cui cedi la quota.",
    };
  }
  if (input.pct == null || !Number.isFinite(input.pct) || input.pct <= 0) {
    return {
      ok: false,
      error: "Indica la percentuale ceduta all'intermediario.",
    };
  }
  if (input.pct > 100) {
    return { ok: false, error: "La quota intermediario non può superare 100." };
  }
  const disponibile = input.quotaProfessional;
  if (disponibile == null || !Number.isFinite(disponibile)) {
    return {
      ok: false,
      error:
        "Il Professional non ha una quota dal Senior: non può cederne una parte.",
    };
  }
  if (input.pct > disponibile) {
    return {
      ok: false,
      error: `L'intermediario non può avere più del ${disponibile}% del Professional.`,
    };
  }
  return { ok: true };
}
