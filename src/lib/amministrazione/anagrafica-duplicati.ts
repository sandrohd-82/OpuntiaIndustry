import {
  normalizeCompanyNameKey,
  normalizeVatKey,
} from "@/lib/amministrazione/fic-anagrafiche";
import { normalizeCanaleEmail, normalizeCanaleTelefono } from "@/lib/amministrazione/contatto-canale-attenzione";

export const ANAGRAFICA_SIMILARITY_THRESHOLD = 0.85;

export type AnagraficaDuplicatoKind = "cliente" | "cliente_possibile";

export type AnagraficaDuplicatoHit = {
  id: string;
  kind: AnagraficaDuplicatoKind;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  codiceTarga: string | null;
  score: number;
  exactFiscal: boolean;
  motivi: string[];
};

export type AnagraficaDraftCompare = {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  email?: string;
  pec?: string;
  telefono?: string;
  emailGeneriche?: string[];
  telefoniGenerici?: string[];
  citta?: string;
  indirizzo?: string;
};

export type AnagraficaCandidateCompare = AnagraficaDraftCompare & {
  id: string;
  kind: AnagraficaDuplicatoKind;
  codiceTarga?: string | null;
};

function foldText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function compactAlnum(raw: string): string {
  return foldText(raw).replace(/[^a-z0-9]/g, "");
}

function bigrams(raw: string): string[] {
  const s = compactAlnum(raw);
  if (!s) return [];
  if (s.length < 2) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2));
  return out;
}

export function diceBigram(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.length === 0 && gb.length === 0) return 1;
  if (ga.length === 0 || gb.length === 0) return 0;
  const count = new Map<string, number>();
  for (const g of ga) count.set(g, (count.get(g) ?? 0) + 1);
  let inter = 0;
  for (const g of gb) {
    const c = count.get(g) ?? 0;
    if (c > 0) {
      inter += 1;
      count.set(g, c - 1);
    }
  }
  return (2 * inter) / (ga.length + gb.length);
}

export function levenshteinRatio(a: string, b: string): number {
  const sa = compactAlnum(a).slice(0, 80);
  const sb = compactAlnum(b).slice(0, 80);
  if (!sa && !sb) return 1;
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const m = sa.length;
  const n = sb.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = sa[i - 1] === sb[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

export function nameSimilarity(a: string, b: string): number {
  const ka = normalizeCompanyNameKey(a);
  const kb = normalizeCompanyNameKey(b);
  if (ka && kb && ka === kb) return 1;
  return Math.max(diceBigram(a, b), levenshteinRatio(a, b));
}

function emailsOf(d: AnagraficaDraftCompare): string[] {
  const list = [d.email, d.pec, ...(d.emailGeneriche ?? [])]
    .map((e) => normalizeCanaleEmail(e ?? ""))
    .filter((e) => e.includes("@"));
  return [...new Set(list)];
}

function phonesOf(d: AnagraficaDraftCompare): string[] {
  const list = [d.telefono, ...(d.telefoniGenerici ?? [])]
    .map((t) => normalizeCanaleTelefono(t ?? ""))
    .filter(Boolean);
  return [...new Set(list)];
}

function bestPairScore(as: string[], bs: string[], scorer: (a: string, b: string) => number): number {
  if (as.length === 0 || bs.length === 0) return -1;
  let best = 0;
  for (const a of as) {
    for (const b of bs) best = Math.max(best, scorer(a, b));
  }
  return best;
}

export function compareAnagraficaDraft(
  draft: AnagraficaDraftCompare,
  candidate: AnagraficaCandidateCompare
): AnagraficaDuplicatoHit | null {
  const vatA = normalizeVatKey(draft.partitaIva);
  const vatB = normalizeVatKey(candidate.partitaIva);
  const cfA = normalizeVatKey(draft.codiceFiscale);
  const cfB = normalizeVatKey(candidate.codiceFiscale);
  const motivi: string[] = [];
  let exactFiscal = false;

  if (vatA && vatB && vatA === vatB) {
    exactFiscal = true;
    motivi.push("P.IVA identica");
  }
  if (cfA && cfB && cfA === cfB) {
    exactFiscal = true;
    motivi.push("Codice fiscale identico");
  }

  const parts: { w: number; s: number; label: string }[] = [];
  const nameS = nameSimilarity(draft.ragioneSociale, candidate.ragioneSociale);
  if (draft.ragioneSociale.trim() && candidate.ragioneSociale.trim()) {
    parts.push({ w: 0.5, s: nameS, label: "ragione sociale" });
    if (nameS >= 0.85) motivi.push(`Nome ${(nameS * 100).toFixed(0)}%`);
  }

  const mailS = bestPairScore(emailsOf(draft), emailsOf(candidate), (a, b) =>
    a === b ? 1 : 0
  );
  if (mailS >= 0) {
    parts.push({ w: 0.15, s: mailS, label: "mail" });
    if (mailS >= 1) motivi.push("Mail identica");
  }

  const telS = bestPairScore(phonesOf(draft), phonesOf(candidate), (a, b) =>
    a === b ? 1 : 0
  );
  if (telS >= 0) {
    parts.push({ w: 0.15, s: telS, label: "telefono" });
    if (telS >= 1) motivi.push("Telefono identico");
  }

  const sedeA = `${draft.citta ?? ""} ${draft.indirizzo ?? ""}`.trim();
  const sedeB = `${candidate.citta ?? ""} ${candidate.indirizzo ?? ""}`.trim();
  if (sedeA && sedeB) {
    const sedeS = Math.max(diceBigram(sedeA, sedeB), levenshteinRatio(sedeA, sedeB));
    parts.push({ w: 0.2, s: sedeS, label: "sede" });
    if (sedeS >= 0.85) motivi.push(`Sede ${(sedeS * 100).toFixed(0)}%`);
  }

  const weightSum = parts.reduce((acc, p) => acc + p.w, 0);
  const weighted =
    weightSum > 0 ? parts.reduce((acc, p) => acc + p.w * p.s, 0) / weightSum : 0;
  const score = exactFiscal ? 1 : weighted;

  if (!exactFiscal && score < ANAGRAFICA_SIMILARITY_THRESHOLD) return null;
  if (!exactFiscal && motivi.length === 0) {
    motivi.push(`Somiglianza ${(score * 100).toFixed(0)}%`);
  }

  return {
    id: candidate.id,
    kind: candidate.kind,
    ragioneSociale: candidate.ragioneSociale,
    partitaIva: candidate.partitaIva,
    codiceFiscale: candidate.codiceFiscale,
    codiceTarga: candidate.codiceTarga ?? null,
    score,
    exactFiscal,
    motivi,
  };
}

export function draftFromClienteInput(input: {
  ragioneSociale: string;
  partitaIva?: string;
  codiceFiscale?: string;
  email?: string;
  pec?: string;
  telefono?: string;
  emailGeneriche?: string[];
  telefoniGenerici?: string[];
  sedeAmministrativa?: { citta?: string; indirizzo?: string };
}): AnagraficaDraftCompare {
  return {
    ragioneSociale: input.ragioneSociale,
    partitaIva: input.partitaIva ?? "",
    codiceFiscale: input.codiceFiscale ?? "",
    email: input.email,
    pec: input.pec,
    telefono: input.telefono,
    emailGeneriche: input.emailGeneriche,
    telefoniGenerici: input.telefoniGenerici,
    citta: input.sedeAmministrativa?.citta,
    indirizzo: input.sedeAmministrativa?.indirizzo,
  };
}
