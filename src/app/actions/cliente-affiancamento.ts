"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  aziendaNellaLinea,
  destinatariVisibili,
  personaAttore,
  type PersonaLinea,
} from "@/lib/amministrazione/cliente-affiancamento";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
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
  const persone = data.map((row) => {
    const gradoRaw = String(
      (row as { commerciale_grado?: string | null }).commerciale_grado ?? ""
    ).toLowerCase();
    const grado =
      gradoRaw === "senior" ||
      gradoRaw === "professional" ||
      gradoRaw === "executive"
        ? gradoRaw
        : null;
    const nome = `${(row as { cognome?: string }).cognome ?? ""} ${(row as { nome?: string }).nome ?? ""}`.trim();
    return {
      id: String((row as { id: string }).id),
      userId: (row as { user_id?: string | null }).user_id
        ? String((row as { user_id: string }).user_id)
        : null,
      parentId: (row as { parent_id?: string | null }).parent_id
        ? String((row as { parent_id: string }).parent_id)
        : null,
      grado,
      nome: nome || "Operatore",
    } satisfies PersonaLinea;
  });
  const { data: profiles } = await service
    .from("profiles")
    .select("id, full_name, first_name, last_name, email, commerciale_grado")
    .eq("is_active", true)
    .not("commerciale_grado", "is", null);
  const noti = new Set(persone.map((p) => p.userId).filter(Boolean));
  for (const raw of profiles ?? []) {
    const profile = raw as {
      id: string;
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      commerciale_grado?: string | null;
    };
    const gradoRaw = String(profile.commerciale_grado ?? "").toLowerCase();
    const grado =
      gradoRaw === "senior" ||
      gradoRaw === "professional" ||
      gradoRaw === "executive"
        ? gradoRaw
        : null;
    if (!grado) continue;
    const esistente = persone.find((p) => p.userId === profile.id);
    if (esistente) {
      if (!esistente.grado) esistente.grado = grado;
      continue;
    }
    if (noti.has(profile.id)) continue;
    const nome =
      profile.full_name?.trim() ||
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
      profile.email ||
      "Operatore";
    persone.push({
      id: profile.id,
      userId: profile.id,
      parentId: null,
      grado,
      nome,
    });
  }
  return persone;
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
        grado: "senior" | "professional" | "executive";
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
  const { data: row, error } = await service
    .from(tableOf(input.kind))
    .select("commerciale_id, affiancato_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!row) return { success: false, error: "Scheda non trovata." };
  const persone = await loadPersoneLinea();
  const actor = personaAttore(persone, auth.userId);
  const admin = isAdminLikeProfile(auth.profile);
  const commercialeId = (row as { commerciale_id?: string | null }).commerciale_id
    ? String((row as { commerciale_id: string }).commerciale_id)
    : null;
  const affiancatoId = (row as { affiancato_id?: string | null }).affiancato_id
    ? String((row as { affiancato_id: string }).affiancato_id)
    : null;
  const destinatari = destinatariVisibili({
    admin,
    actor,
    persone,
    commercialeId,
  })
    .filter(
      (
        p
      ): p is PersonaLinea & {
        userId: string;
        grado: "senior" | "professional" | "executive";
      } =>
        Boolean(p.userId) &&
        (p.grado === "senior" ||
          p.grado === "professional" ||
          p.grado === "executive")
    )
    .map((p) => ({ id: p.userId, nome: p.nome, grado: p.grado }))
    .sort((a, b) => {
      const ordine = { senior: 0, professional: 1, executive: 2 };
      const diff = ordine[a.grado] - ordine[b.grado];
      if (diff !== 0) return diff;
      return a.nome.localeCompare(b.nome, "it");
    });
  const nellaLinea =
    admin ||
    (actor ? aziendaNellaLinea({ actor, persone, commercialeId }) : false);
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
  const admin = isAdminLikeProfile(auth.profile);
  if (!actor && !admin) {
    return {
      success: false,
      error: "Solo un Senior o un Professional può cedere o affiancare.",
    };
  }
  const commercialeId = row.commerciale_id ? String(row.commerciale_id) : null;
  const affiancatoId = row.affiancato_id ? String(row.affiancato_id) : null;
  const nellaLinea =
    admin ||
    (actor ? aziendaNellaLinea({ actor, persone, commercialeId }) : false);
  if (!nellaLinea) {
    return {
      success: false,
      error: "Puoi agire solo sulle aziende della tua linea.",
    };
  }
  const ammessi = new Set(
    destinatariVisibili({ admin, actor, persone, commercialeId })
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
