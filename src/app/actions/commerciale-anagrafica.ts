"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { mapClienteRow, type Cliente } from "@/lib/amministrazione/clienti";
import type { ClienteRow } from "@/types/database";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  COMMERCIALE_GRADO_RANK,
  commercialeAziendaOrigine,
  commercialeGradoLabel,
  parseCommercialeGrado,
  type CommercialeAssegnabile,
  type CommercialeAziendaOrigine,
  type CommercialeGrado,
} from "@/lib/auth/commerciale";
import {
  loadCommercialLineageUserIds,
  loadCommercialeLabels,
} from "@/lib/auth/commerciale-lineage";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const assignSchema = z.object({
  aziendaTipo: z.enum(["cliente", "cliente_possibile"]),
  aziendaId: z.string().uuid(),
  commercialeId: z.string().uuid().nullable(),
});

export type CommercialeAnagraficaContext = {
  canAssign: boolean;
  lineageIds: string[];
  commerciali: CommercialeAssegnabile[];
};

function canAssignCommerciale(auth: {
  actorProfile: Parameters<typeof isSuperadminProfile>[0];
  impersonating: boolean;
}): boolean {
  return !auth.impersonating && isSuperadminProfile(auth.actorProfile);
}

function displayName(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const composed = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return row.full_name?.trim() || composed || row.email?.trim() || "Operatore";
}

export async function getCommercialeAnagraficaContextAction(): Promise<
  CommercialeAnagraficaContext
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const lineageIds = await loadCommercialLineageUserIds(auth.userId);
  const canAssign = canAssignCommerciale(auth);
  if (!canAssign) {
    return { canAssign: false, lineageIds, commerciali: [] };
  }

  const service = createServiceClient();
  const { data: persone } = await service
    .from("organigramma_persone")
    .select("user_id, commerciale_grado, nome, cognome")
    .is("deleted_at", null)
    .not("user_id", "is", null);

  const { data: fromReparti } = await service
    .from("profile_reparti")
    .select("profile_id")
    .eq("codice", "commerciale")
    .is("deleted_at", null);

  const { data: graded } = await service
    .from("profiles")
    .select("id, email, full_name, first_name, last_name, commerciale_grado")
    .eq("is_active", true)
    .not("commerciale_grado", "is", null);

  const ids = new Set<string>();
  const gradoByPersona = new Map<string, CommercialeGrado | null>();
  for (const p of persone ?? []) {
    const uid = String((p as { user_id?: string }).user_id ?? "");
    if (!uid) continue;
    ids.add(uid);
    gradoByPersona.set(
      uid,
      parseCommercialeGrado((p as { commerciale_grado?: string }).commerciale_grado)
    );
  }
  for (const r of fromReparti ?? []) {
    const uid = String((r as { profile_id?: string }).profile_id ?? "");
    if (uid) ids.add(uid);
  }
  for (const p of graded ?? []) {
    ids.add(String((p as { id: string }).id));
  }
  if (ids.size === 0) {
    return { canAssign, lineageIds, commerciali: [] };
  }

  const { data: profiles } = await service
    .from("profiles")
    .select("id, email, full_name, first_name, last_name, commerciale_grado")
    .in("id", [...ids])
    .eq("is_active", true);

  const commerciali = ((profiles ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    commerciale_grado: string | null;
  }>)
    .map((p) => ({
      id: p.id,
      nome: displayName(p),
      email: p.email ?? "",
      grado:
        gradoByPersona.get(p.id) ?? parseCommercialeGrado(p.commerciale_grado),
    }))
    .sort((a, b) => {
      const ra = a.grado ? COMMERCIALE_GRADO_RANK[a.grado] : 99;
      const rb = b.grado ? COMMERCIALE_GRADO_RANK[b.grado] : 99;
      if (ra !== rb) return ra - rb;
      return a.nome.localeCompare(b.nome, "it");
    });

  return { canAssign, lineageIds, commerciali };
}

/** In modifica scheda: applica il collegamento solo se Super Admin e il valore è cambiato. */
export async function syncCommercialeOnSchedaUpdate(opts: {
  aziendaTipo: "cliente" | "cliente_possibile";
  aziendaId: string;
  commercialeId: string | null | undefined;
  currentId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (opts.commercialeId === undefined) return { ok: true };
  if ((opts.commercialeId ?? null) === (opts.currentId ?? null)) {
    return { ok: true };
  }
  const { auth } = await requireAreaAccess("amministrazione");
  if (!canAssignCommerciale(auth)) return { ok: true };
  const res = await assignCommercialeAnagraficaAction({
    aziendaTipo: opts.aziendaTipo,
    aziendaId: opts.aziendaId,
    commercialeId: opts.commercialeId,
  });
  if (!res.success) return { ok: false, error: res.error };
  return { ok: true };
}

export async function assignCommercialeAnagraficaAction(
  raw: unknown
): Promise<
  | {
      success: true;
      commercialeId: string | null;
      commercialeNome: string;
      commercialeGrado: CommercialeGrado | null;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!canAssignCommerciale(auth)) {
    return {
      success: false,
      error: "Solo il Super Admin può collegare un’azienda a un commerciale.",
    };
  }
  const parsed = assignSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati collegamento non validi." };
  }

  const table =
    parsed.data.aziendaTipo === "cliente" ? "clienti" : "clienti_possibili";
  const service = createServiceClient();

  if (parsed.data.commercialeId) {
    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .eq("id", parsed.data.commercialeId)
      .eq("is_active", true)
      .maybeSingle();
    if (!profile) {
      return { success: false, error: "Profilo commerciale non trovato." };
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await service
    .from(table)
    .update({
      commerciale_id: parsed.data.commercialeId,
      commerciale_assegnato_at: parsed.data.commercialeId ? now : null,
      commerciale_assegnato_by: parsed.data.commercialeId
        ? auth.actorUserId
        : null,
      updated_by: auth.actorUserId,
    })
    .eq("id", parsed.data.aziendaId)
    .is("deleted_at", null)
    .select("id, ragione_sociale, commerciale_id")
    .maybeSingle();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Impossibile collegare il commerciale.",
    };
  }

  let commercialeNome = "—";
  let commercialeGrado: CommercialeGrado | null = null;
  if (parsed.data.commercialeId) {
    const { data: prof } = await service
      .from("profiles")
      .select("full_name, first_name, last_name, email, commerciale_grado")
      .eq("id", parsed.data.commercialeId)
      .maybeSingle();
    const { data: persona } = await service
      .from("organigramma_persone")
      .select("commerciale_grado, nome, cognome")
      .eq("user_id", parsed.data.commercialeId)
      .is("deleted_at", null)
      .maybeSingle();
    commercialeGrado =
      parseCommercialeGrado(persona?.commerciale_grado) ??
      parseCommercialeGrado(prof?.commerciale_grado);
    commercialeNome =
      `${persona?.nome ?? ""} ${persona?.cognome ?? ""}`.trim() ||
      displayName(prof ?? {});
  }

  await writeAuditLog({
    entity_type: table,
    entity_id: parsed.data.aziendaId,
    action: parsed.data.commercialeId
      ? "commerciale_assegna"
      : "commerciale_revoca",
    actor_id: auth.actorUserId,
    summary: parsed.data.commercialeId
      ? `Collegata a ${commercialeNome} (${commercialeGradoLabel(commercialeGrado)})`
      : "Rimosso collegamento commerciale",
    payload: {
      commerciale_id: parsed.data.commercialeId,
      ragione_sociale: (data as { ragione_sociale?: string }).ragione_sociale,
    },
  });

  return {
    success: true,
    commercialeId: parsed.data.commercialeId,
    commercialeNome,
    commercialeGrado,
  };
}

export type AziendaCommercialePortfolio = Cliente & {
  origine: CommercialeAziendaOrigine;
};

const personaIdSchema = z.object({ personaId: z.string().uuid() });

/** Aziende caricate o collegate al profilo gestionale dell’operatore. */
export async function listAziendeCommercialePersonaAction(
  raw: unknown
): Promise<
  | { success: true; userId: string | null; aziende: AziendaCommercialePortfolio[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const parsed = personaIdSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Operatore non valido." };
  }

  const service = createServiceClient();
  const { data: persona, error: personaError } = await service
    .from("organigramma_persone")
    .select("id, user_id")
    .eq("id", parsed.data.personaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (personaError) return { success: false, error: personaError.message };
  if (!persona) return { success: false, error: "Operatore non trovato." };

  const userId = persona.user_id ? String(persona.user_id) : null;
  if (!userId) {
    return { success: true, userId: null, aziende: [] };
  }

  const { data: rows, error } = await service
    .from("clienti")
    .select("*")
    .or(`created_by.eq.${userId},commerciale_id.eq.${userId}`)
    .is("deleted_at", null)
    .order("ragione_sociale", { ascending: true });
  if (error) return { success: false, error: error.message };

  const labels = await loadCommercialeLabels(
    (rows ?? [])
      .map((r) => String((r as { commerciale_id?: string | null }).commerciale_id ?? ""))
      .filter(Boolean)
  );

  const aziende = (rows ?? []).map((row) => {
    const mapped = mapClienteRow(
      row as ClienteRow,
      row.commerciale_id
        ? labels.get(String(row.commerciale_id))
        : undefined
    );
    return {
      ...mapped,
      origine: commercialeAziendaOrigine({
        userId,
        createdBy: mapped.createdBy,
        commercialeId: mapped.commercialeId,
      }),
    };
  });

  return { success: true, userId, aziende };
}
