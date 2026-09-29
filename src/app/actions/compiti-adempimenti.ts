"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getAuthContext } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { createServiceClient } from "@/lib/supabase/server";

export type CompitoAdempimento = {
  id: string;
  codice: string;
  titolo: string;
  spiegazione: string;
  persone: Array<{ id: string; nome: string }>;
};

export type OperatoreCompito = {
  id: string;
  nome: string;
};

function nomeProfilo(row: {
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
}): string {
  const full = (row.full_name ?? "").trim();
  if (full) return full;
  const composto = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return composto || row.email;
}

async function requireAdmin() {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified || !isSuperadminProfile(auth.profile)) {
    return null;
  }
  return auth;
}

export async function listCompitiAdempimentiAction(): Promise<
  | { success: true; compiti: CompitoAdempimento[]; operatori: OperatoreCompito[] }
  | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth) return { success: false, error: "Solo un Super Admin può associare i compiti." };
  const supabase = createServiceClient();
  const { data: compiti, error } = await supabase
    .from("compiti_adempimenti")
    .select("id, codice, titolo, spiegazione, sort_order")
    .eq("attivo", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };

  const ids = (compiti ?? []).map((c) => c.id);
  const { data: persone, error: pErr } = ids.length
    ? await supabase
        .from("compiti_adempimenti_persone")
        .select("compito_id, profile_id")
        .in("compito_id", ids)
        .is("deleted_at", null)
    : { data: [], error: null };
  if (pErr) return { success: false, error: pErr.message };

  const { data: profili, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, first_name, last_name, email, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (profErr) return { success: false, error: profErr.message };

  const operatori = ((profili ?? []) as Array<{
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
  }>).map((p) => ({ id: p.id, nome: nomeProfilo(p) }));
  const nomeById = new Map(operatori.map((o) => [o.id, o.nome]));

  return {
    success: true,
    operatori,
    compiti: (compiti ?? []).map((c) => ({
      id: c.id,
      codice: c.codice,
      titolo: c.titolo,
      spiegazione: c.spiegazione,
      persone: ((persone ?? []) as Array<{ compito_id: string; profile_id: string }>)
        .filter((p) => p.compito_id === c.id)
        .map((p) => ({
          id: p.profile_id,
          nome: nomeById.get(p.profile_id) ?? p.profile_id,
        })),
    })),
  };
}

const saveSchema = z.object({
  compitoId: z.string().uuid(),
  spiegazione: z.string().trim().max(4000),
  profileIds: z.array(z.string().uuid()).max(40),
});

export async function saveCompitoAdempimentoAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth) return { success: false, error: "Solo un Super Admin può associare i compiti." };
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const input = parsed.data;
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("compiti_adempimenti")
    .update({
      spiegazione: input.spiegazione,
      updated_by: auth.userId,
    })
    .eq("id", input.compitoId)
    .is("deleted_at", null);
  if (upErr) return { success: false, error: upErr.message };

  const { data: esistenti, error: exErr } = await supabase
    .from("compiti_adempimenti_persone")
    .select("id, profile_id, deleted_at")
    .eq("compito_id", input.compitoId);
  if (exErr) return { success: false, error: exErr.message };

  const rows = (esistenti ?? []) as Array<{
    id: string;
    profile_id: string;
    deleted_at: string | null;
  }>;
  const scelti = new Set(input.profileIds);

  for (const row of rows) {
    if (scelti.has(row.profile_id)) {
      if (row.deleted_at) {
        const { error } = await supabase
          .from("compiti_adempimenti_persone")
          .update({
            deleted_at: null,
            deleted_by: null,
            updated_by: auth.userId,
          })
          .eq("id", row.id);
        if (error) return { success: false, error: error.message };
      }
      scelti.delete(row.profile_id);
      continue;
    }
    if (!row.deleted_at) {
      const { error } = await supabase
        .from("compiti_adempimenti_persone")
        .update({
          deleted_at: now,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("id", row.id);
      if (error) return { success: false, error: error.message };
    }
  }

  for (const profileId of scelti) {
    const { error } = await supabase.from("compiti_adempimenti_persone").insert({
      compito_id: input.compitoId,
      profile_id: profileId,
      created_by: auth.userId,
      updated_by: auth.userId,
    });
    if (error) return { success: false, error: error.message };
  }

  await writeAuditLog({
    entity_type: "compiti_adempimenti",
    entity_id: input.compitoId,
    action: "update",
    actor_id: auth.userId,
    summary: "Aggiornati spiegazione e persone del compito",
    payload: { profileIds: input.profileIds },
  });
  return { success: true };
}
