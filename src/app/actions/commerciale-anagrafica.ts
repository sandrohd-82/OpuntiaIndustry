"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  COMMERCIALE_GRADO_RANK,
  commercialeGradoLabel,
  parseCommercialeGrado,
  type CommercialeAssegnabile,
  type CommercialeGrado,
} from "@/lib/auth/commerciale";
import { loadCommercialLineageUserIds } from "@/lib/auth/commerciale-lineage";
import { isAdminLikeProfile, isSuperadminProfile } from "@/lib/auth/roles";
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
  profile: Parameters<typeof isAdminLikeProfile>[0];
  impersonating: boolean;
}): boolean {
  if (auth.impersonating) return false;
  return isAdminLikeProfile(auth.profile) || isSuperadminProfile(auth.profile);
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
      error: "Solo Super Admin o amministratore può collegare il commerciale.",
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
      commerciale_assegnato_by: parsed.data.commercialeId ? auth.userId : null,
      updated_by: auth.userId,
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
    actor_id: auth.userId,
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
