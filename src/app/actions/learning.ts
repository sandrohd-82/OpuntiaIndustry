"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import {
  decisionEventClientSchema,
  recordDecision,
  suggestCatalogFromHistory,
  type LearningCatalogHint,
} from "@/lib/learning/decision-events";
import { z } from "zod";

/**
 * Registra una decisione dal client (RBAC area corrente).
 */
export async function recordDecisionAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  // Accetta amministrazione o chat: chiunque autenticato con area app
  let userId: string;
  try {
    const a = await requireAreaAccess("amministrazione");
    userId = a.auth.userId;
  } catch {
    try {
      const c = await requireAreaAccess("chat");
      userId = c.auth.userId;
    } catch {
      return { success: false, error: "Accesso non autorizzato." };
    }
  }

  const parsed = decisionEventClientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Payload non valido.",
    };
  }

  await recordDecision({
    actorId: userId,
    module: parsed.data.module,
    context: parsed.data.context,
    action: parsed.data.action,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    inputText: parsed.data.inputText,
    choiceBefore: parsed.data.choiceBefore,
    choiceAfter: parsed.data.choiceAfter,
    metadata: parsed.data.metadata,
  });

  return { success: true };
}

const suggestSchema = z.object({
  query: z.string().max(2000),
  kind: z
    .enum(["all", "servizio", "prodotto", "materia", "contributo"])
    .optional()
    .default("all"),
  limit: z.number().int().min(1).max(30).optional().default(12),
});

export async function suggestCatalogFromHistoryAction(
  raw: unknown
): Promise<
  | { success: true; hints: LearningCatalogHint[] }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = suggestSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Query non valida." };
  }
  const hints = await suggestCatalogFromHistory({
    query: parsed.data.query,
    kind: parsed.data.kind,
    actorId: auth.userId,
    limit: parsed.data.limit,
  });
  return { success: true, hints };
}
