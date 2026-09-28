"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  aziendaNellaLinea,
  destinatariCessione,
  personaAttore,
  type PersonaLinea,
} from "@/lib/amministrazione/cliente-affiancamento";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

type Kind = "cliente" | "possibile";

function tableOf(kind: Kind): "clienti" | "clienti_possibili" {
  return kind === "cliente" ? "clienti" : "clienti_possibili";
}

async function loadPersoneLinea(): Promise<PersonaLinea[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("organigramma_persone")
    .select("id, user_id, parent_id, nome, cognome, commerciale_grado")
    .is("deleted_at", null);
  if (error || !data) return [];
  return data.map((row) => {
    const grado = (row as { commerciale_grado?: string | null }).commerciale_grado;
    const nome = `${(row as { cognome?: string }).cognome ?? ""} ${(row as { nome?: string }).nome ?? ""}`.trim();
    return {
      id: String((row as { id: string }).id),
      userId: (row as { user_id?: string | null }).user_id
        ? String((row as { user_id: string }).user_id)
        : null,
      parentId: (row as { parent_id?: string | null }).parent_id
        ? String((row as { parent_id: string }).parent_id)
        : null,
      grado:
        grado === "senior" || grado === "professional" || grado === "executive"
          ? grado
          : null,
      nome: nome || "Operatore",
    };
  });
}

function nomeDi(persone: PersonaLinea[], userId: string | null): string {
  if (!userId) return "";
  return persone.find((p) => p.userId === userId)?.nome ?? "";
}

export async function contestoCessioneAffiancamentoAction(input: {
  kind: Kind;
  id: string;
}): Promise<
  | {
      success: true;
      puoAgire: boolean;
      affiancatoId: string | null;
      affiancatoNome: string;
      destinatari: {
        id: string;
        nome: string;
        grado: "professional" | "executive";
      }[];
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const id = input.id?.trim();
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: "Scheda non valida." };
  }
  const service = createServiceClient();
  const { data: row } = await service
    .from(tableOf(input.kind))
    .select("commerciale_id, affiancato_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { success: false, error: "Scheda non trovata." };
  const persone = await loadPersoneLinea();
  const actor = personaAttore(persone, auth.userId);
  const commercialeId = (row as { commerciale_id?: string | null }).commerciale_id
    ? String((row as { commerciale_id: string }).commerciale_id)
    : null;
  const affiancatoId = (row as { affiancato_id?: string | null }).affiancato_id
    ? String((row as { affiancato_id: string }).affiancato_id)
    : null;
  const nellaLinea = actor
    ? aziendaNellaLinea({ actor, persone, commercialeId })
    : false;
  const destinatari = actor && nellaLinea
    ? destinatariCessione({ actor, persone })
        .filter((p): p is PersonaLinea & { userId: string; grado: "professional" | "executive" } =>
          Boolean(p.userId) &&
          (p.grado === "professional" || p.grado === "executive")
        )
        .map((p) => ({ id: p.userId, nome: p.nome, grado: p.grado }))
    : [];
  return {
    success: true,
    puoAgire: nellaLinea && (destinatari.length > 0 || Boolean(affiancatoId)),
    affiancatoId,
    affiancatoNome: nomeDi(persone, affiancatoId),
    destinatari,
  };
}

const azioneSchema = z.object({
  kind: z.enum(["cliente", "possibile"]),
  id: z.string().uuid(),
  mode: z.enum(["cedi", "affianca", "togli"]),
  targetUserId: z.string().uuid().nullable().optional(),
});

export async function cediOAffiancaAnagraficaAction(
  raw: z.input<typeof azioneSchema>
): Promise<
  | {
      success: true;
      commercialeId: string | null;
      intermediarioAzzerato: boolean;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const parsed = azioneSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi." };
  }
  const { kind, id, mode } = parsed.data;
  const targetUserId = parsed.data.targetUserId?.trim() || null;
  const service = createServiceClient();
  const table = tableOf(kind);
  const { data } = await service
    .from(table)
    .select("id, ragione_sociale, commerciale_id, affiancato_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as unknown as {
    id: string;
    ragione_sociale?: string | null;
    commerciale_id?: string | null;
    affiancato_id?: string | null;
  } | null;
  if (!row) return { success: false, error: "Scheda non trovata." };

  const persone = await loadPersoneLinea();
  const actor = personaAttore(persone, auth.userId);
  if (!actor) {
    return {
      success: false,
      error: "Solo un Senior o un Professional può cedere o affiancare.",
    };
  }
  const commercialeId = row.commerciale_id ? String(row.commerciale_id) : null;
  const affiancatoId = row.affiancato_id ? String(row.affiancato_id) : null;
  if (!aziendaNellaLinea({ actor, persone, commercialeId })) {
    return {
      success: false,
      error: "Puoi agire solo sulle aziende della tua linea.",
    };
  }
  const ammessi = new Set(
    destinatariCessione({ actor, persone })
      .map((p) => p.userId)
      .filter((uid): uid is string => Boolean(uid))
  );
  const now = new Date().toISOString();
  const ragione = String(row.ragione_sociale ?? "");

  if (mode === "togli") {
    if (!affiancatoId) {
      return { success: false, error: "Non c'è un affiancato da togliere." };
    }
    const { error } = await service
      .from(table)
      .update({
        affiancato_id: null,
        affiancato_at: null,
        affiancato_by: null,
        updated_by: auth.userId,
        updated_at: now,
      })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await writeAuditLog({
      entity_type: table,
      entity_id: id,
      action: "update",
      actor_id: auth.userId,
      summary: `Affiancamento tolto su ${ragione}: non è più ${nomeDi(persone, affiancatoId) || "l'affiancato"}.`,
      payload: {
        modalita: "affiancamento_tolto",
        da_user_id: affiancatoId,
        a_user_id: null,
      },
    });
    return {
      success: true,
      commercialeId,
      intermediarioAzzerato: false,
    };
  }

  if (!targetUserId || !ammessi.has(targetUserId)) {
    return {
      success: false,
      error: "Scegli un sottoposto della tua linea.",
    };
  }
  if (targetUserId === commercialeId) {
    return {
      success: false,
      error: "Questa persona è già il commerciale della scheda.",
    };
  }

  if (mode === "affianca") {
    if (targetUserId === affiancatoId) {
      return { success: false, error: "Questa persona è già affiancata." };
    }
    const { error } = await service
      .from(table)
      .update({
        affiancato_id: targetUserId,
        affiancato_at: now,
        affiancato_by: auth.userId,
        updated_by: auth.userId,
        updated_at: now,
      })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await writeAuditLog({
      entity_type: table,
      entity_id: id,
      action: "update",
      actor_id: auth.userId,
      summary: `Affiancato ${nomeDi(persone, targetUserId)} su ${ragione}. Il commerciale resta ${nomeDi(persone, commercialeId) || "invariato"}.`,
      payload: {
        modalita: "affiancamento",
        da_user_id: affiancatoId,
        a_user_id: targetUserId,
      },
    });
    return {
      success: true,
      commercialeId,
      intermediarioAzzerato: false,
    };
  }

  let intermediarioAzzerato = false;
  const patch: Record<string, string | null> = {
    commerciale_id: targetUserId,
    commerciale_assegnato_at: now,
    commerciale_assegnato_by: auth.userId,
    updated_by: auth.userId,
    updated_at: now,
  };
  if (kind === "cliente") {
    const { data: extra } = await service
      .from("clienti")
      .select("intermediario_id")
      .eq("id", id)
      .maybeSingle();
    const interRaw = (extra as { intermediario_id?: string | null } | null)
      ?.intermediario_id;
    const interId = interRaw ? String(interRaw) : null;
    const nuovo = persone.find((p) => p.userId === targetUserId) ?? null;
    const inter = interId
      ? persone.find((p) => p.userId === interId) ?? null
      : null;
    const coerente =
      nuovo?.grado === "professional" &&
      inter?.grado === "executive" &&
      inter.parentId === nuovo.id;
    if (interId && !coerente) {
      patch.intermediario_id = null;
      patch.intermediario_provvigione_pct = null;
      intermediarioAzzerato = true;
    }
  }
  if (affiancatoId === targetUserId) {
    patch.affiancato_id = null;
    patch.affiancato_at = null;
    patch.affiancato_by = null;
  }
  const { error } = await service
    .from(table)
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: table,
    entity_id: id,
    action: "commerciale_assegna",
    actor_id: auth.userId,
    summary: `Cliente ceduto: ${ragione} passa da ${nomeDi(persone, commercialeId) || "nessun commerciale"} a ${nomeDi(persone, targetUserId)}.`,
    payload: {
      modalita: "cessione",
      da_user_id: commercialeId,
      a_user_id: targetUserId,
      intermediario_azzerato: intermediarioAzzerato,
    },
  });
  return {
    success: true,
    commercialeId: targetUserId,
    intermediarioAzzerato,
  };
}
