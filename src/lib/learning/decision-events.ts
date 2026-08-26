import { normalizeAffinityText } from "@/lib/amministrazione/catalogo-affinity";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const DECISION_ACTIONS = [
  "search",
  "suggest",
  "choose",
  "confirm",
  "reject",
  "edit_text",
  "transcribe",
  "observe",
] as const;

export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export type DecisionEventInput = {
  actorId?: string | null;
  module: string;
  context: string;
  action: DecisionAction;
  entityType?: string;
  entityId?: string | null;
  inputText?: string;
  choiceBefore?: Record<string, unknown>;
  choiceAfter?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export const decisionEventClientSchema = z.object({
  module: z.string().trim().min(1).max(80),
  context: z.string().trim().min(1).max(120),
  action: z.enum(DECISION_ACTIONS),
  entityType: z.string().max(80).optional().default(""),
  entityId: z.string().uuid().nullable().optional(),
  inputText: z.string().max(4000).optional().default(""),
  choiceBefore: z.record(z.string(), z.unknown()).optional().default({}),
  choiceAfter: z.record(z.string(), z.unknown()).optional().default({}),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

/**
 * Registra una decisione nel learning loop (best-effort, non blocca il flusso).
 */
export async function recordDecision(input: DecisionEventInput): Promise<void> {
  try {
    const supabase = await createClient();
    const inputText = (input.inputText ?? "").trim().slice(0, 4000);
    const { error } = await supabase.from("decision_events").insert({
      actor_id: input.actorId ?? null,
      created_by: input.actorId ?? null,
      module: input.module.slice(0, 80),
      context: input.context.slice(0, 120),
      action: input.action,
      entity_type: (input.entityType ?? "").slice(0, 80),
      entity_id: input.entityId ?? null,
      input_text: inputText,
      input_norm: normalizeAffinityText(inputText).slice(0, 2000),
      choice_before: input.choiceBefore ?? {},
      choice_after: input.choiceAfter ?? {},
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error("[decision_events]", error.message);
    }
  } catch (e) {
    console.error("[decision_events]", e);
  }
}

export type LearningCatalogHint = {
  codice: string;
  nome: string;
  kind: "servizio" | "prodotto" | "materia" | "contributo";
  score: number;
  hits: number;
  source: "learning";
};

type ChoiceAfter = {
  codice?: unknown;
  nome?: unknown;
  kind?: unknown;
};

/**
 * Suggerimenti catalogo da storico decisioni (choose/confirm su match).
 */
export async function suggestCatalogFromHistory(input: {
  query: string;
  kind?: "all" | "servizio" | "prodotto" | "materia" | "contributo";
  actorId?: string | null;
  limit?: number;
}): Promise<LearningCatalogHint[]> {
  const qNorm = normalizeAffinityText(input.query);
  if (!qNorm || qNorm.length < 3) return [];

  const supabase = await createClient();
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 30);

  const { data, error } = await supabase
    .from("decision_events")
    .select("input_norm, choice_after, actor_id, occurred_at")
    .in("context", [
      "catalog_scan_choose",
      "catalog_apply",
      "invoice_ai_confirm",
    ])
    .in("action", ["choose", "confirm"])
    .order("occurred_at", { ascending: false })
    .limit(400);
  if (error || !data?.length) {
    if (error) console.error("[learning-suggest]", error.message);
    return [];
  }

  const qTokens = new Set(qNorm.split(" ").filter((t) => t.length >= 3));
  const agg = new Map<
    string,
    LearningCatalogHint & { weight: number }
  >();

  for (const row of data) {
    const after = (row.choice_after ?? {}) as ChoiceAfter;
    const codice = String(after.codice ?? "").trim();
    const nome = String(after.nome ?? "").trim();
    const kind = String(after.kind ?? "").trim() as LearningCatalogHint["kind"];
    if (!codice || !nome) continue;
    if (
      input.kind &&
      input.kind !== "all" &&
      kind &&
      kind !== input.kind
    ) {
      continue;
    }
    if (
      kind &&
      !["servizio", "prodotto", "materia", "contributo"].includes(kind)
    ) {
      continue;
    }

    const histNorm = String(row.input_norm ?? "").trim();
    if (!histNorm) continue;

    const hTokens = histNorm.split(" ").filter((t) => t.length >= 3);
    if (!hTokens.length) continue;
    let hits = 0;
    for (const t of hTokens) {
      if (qTokens.has(t)) hits += 1;
      else {
        for (const qt of qTokens) {
          if (
            qt.length >= 4 &&
            t.length >= 4 &&
            (qt.startsWith(t) || t.startsWith(qt))
          ) {
            hits += 1;
            break;
          }
        }
      }
    }
    const coverage = hits / hTokens.length;
    if (coverage < 0.35 && hits < 2) continue;

    const sameActorBoost =
      input.actorId && row.actor_id === input.actorId ? 1.15 : 1;
    const weight = coverage * 100 * sameActorBoost;
    const key = codice.toLowerCase();
    const prev = agg.get(key);
    if (!prev) {
      agg.set(key, {
        codice,
        nome,
        kind: kind || "prodotto",
        score: Math.round(Math.min(99, weight)),
        hits: 1,
        source: "learning",
        weight,
      });
    } else {
      prev.hits += 1;
      prev.weight += weight;
      prev.score = Math.round(
        Math.min(99, prev.weight / Math.max(1, Math.sqrt(prev.hits)))
      );
      if (nome) prev.nome = nome;
      if (kind) prev.kind = kind;
    }
  }

  return [...agg.values()]
    .sort((a, b) => b.score - a.score || b.hits - a.hits)
    .slice(0, limit)
    .map(({ weight: _w, ...rest }) => rest);
}
