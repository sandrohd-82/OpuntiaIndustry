import {
  normalizeAffinityText,
  scoreTokenCoverage,
} from "@/lib/amministrazione/catalogo-affinity";

export const MAIL_RICHIESTA_PURPOSES = [
  "campionatura-mail",
  "ordine-accettazione-mail",
  "ordine-richiesta-mail",
] as const;
export type MailRichiestaPurpose = (typeof MAIL_RICHIESTA_PURPOSES)[number];

export type MailRichiestaContext = {
  purpose: MailRichiestaPurpose;
  aziendaLabel?: string;
  prodotti?: string[];
  extra?: string[];
};

export type MailRichiestaScoreInput = {
  subject: string;
  bodyText: string;
  inbound: boolean;
  receivedAt: string | null;
  aiIntent?: string | null;
};

const PURPOSE_TERMS: Record<MailRichiestaPurpose, string[]> = {
  "campionatura-mail": [
    "campione",
    "campioni",
    "campionatura",
    "campionature",
    "sample",
    "samples",
    "sampling",
    "ndra",
    "ndrb",
    "ndri",
    "opuntia",
    "fico",
    "farina",
    "cladod",
  ],
  "ordine-accettazione-mail": [
    "accett",
    "confermo",
    "conferma",
    "procedete",
    "preventivo",
    "ordine",
    "order",
    "acquisto",
    "po",
  ],
  "ordine-richiesta-mail": [
    "ordine",
    "order",
    "acquisto",
    "richiesta",
    "quotazione",
    "preventivo",
    "conferma",
    "kg",
    "listino",
  ],
};

const INTENT_BONUS: Record<MailRichiestaPurpose, Record<string, number>> = {
  "campionatura-mail": { ordine_lotto: 8, preventivo_listino: 4 },
  "ordine-accettazione-mail": {
    preventivo_listino: 16,
    ordine_lotto: 14,
  },
  "ordine-richiesta-mail": { ordine_lotto: 16, preventivo_listino: 10 },
};

const PROBABLE_SCORE = 28;

function countTermHits(hay: string, terms: string[]): number {
  let n = 0;
  for (const term of terms) {
    if (term.length < 2) continue;
    if (hay.includes(term)) n += 1;
  }
  return n;
}

function recencyBonus(receivedAt: string | null): number {
  if (!receivedAt) return 0;
  const t = new Date(receivedAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const days = (Date.now() - t) / 86_400_000;
  if (days < 0) return 0;
  if (days <= 14) return 10;
  if (days <= 45) return 6;
  if (days <= 120) return 3;
  return 0;
}

export function scoreMailRichiesta(
  mail: MailRichiestaScoreInput,
  ctx: MailRichiestaContext
): { score: number; reasons: string[]; productHit: boolean } {
  const subject = normalizeAffinityText(mail.subject);
  const body = normalizeAffinityText((mail.bodyText ?? "").slice(0, 2500));
  const hay = `${subject} ${body}`.trim();
  const terms = PURPOSE_TERMS[ctx.purpose];
  const reasons: string[] = [];
  let score = 0;

  if (mail.inbound) {
    score += 12;
  }

  const subHits = countTermHits(subject, terms);
  const bodyHits = countTermHits(body, terms);
  if (subHits) {
    score += Math.min(36, subHits * 12);
    reasons.push("oggetto inerente");
  }
  if (bodyHits) {
    score += Math.min(18, bodyHits * 5);
    if (!subHits) reasons.push("testo inerente");
  }

  let productHit = false;
  for (const raw of ctx.prodotti ?? []) {
    const label = raw.trim();
    if (!label) continue;
    const norm = normalizeAffinityText(label);
    if (!norm) continue;
    if (subject.includes(norm) || hay.includes(norm)) {
      score += 28;
      productHit = true;
      reasons.push(label);
      continue;
    }
    const cover = Math.max(
      scoreTokenCoverage(hay, label),
      scoreTokenCoverage(subject, label)
    );
    if (cover >= 55) {
      score += Math.round(cover * 0.28);
      productHit = true;
      reasons.push(label);
    }
  }

  const azienda = (ctx.aziendaLabel ?? "").trim();
  if (azienda) {
    const cover = scoreTokenCoverage(hay, azienda);
    if (cover >= 70) {
      score += 8;
    }
  }

  for (const extra of ctx.extra ?? []) {
    const norm = normalizeAffinityText(extra);
    if (norm.length >= 4 && hay.includes(norm)) {
      score += 10;
      reasons.push(extra.trim());
    }
  }

  const intent = (mail.aiIntent ?? "").trim();
  const intentPts = INTENT_BONUS[ctx.purpose][intent] ?? 0;
  if (intentPts) score += intentPts;

  score += recencyBonus(mail.receivedAt);

  return {
    score,
    reasons: reasons.slice(0, 3),
    productHit,
  };
}

export function isMailRichiestaProbabile(input: {
  score: number;
  productHit: boolean;
}): boolean {
  return input.productHit || input.score >= PROBABLE_SCORE;
}

export function compareMailRichiestaDateDesc(
  a: string | null,
  b: string | null
): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  const na = Number.isFinite(ta) ? ta : 0;
  const nb = Number.isFinite(tb) ? tb : 0;
  return nb - na;
}
