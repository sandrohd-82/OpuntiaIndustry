"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  isScriptFunzione,
  scriptInputSchema,
  type GestionaleScript,
  type ScriptDocumentoStato,
  type ScriptInput,
} from "@/lib/script/catalogo";
import { createClient } from "@/lib/supabase/server";

const SCRIPT_COLS =
  "id, codice, nome, descrizione, funzione, attivo, note, versione, documento_stato, created_at";

type ScriptRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  funzione: string;
  attivo: boolean;
  note: string | null;
  versione: number;
  documento_stato: ScriptDocumentoStato;
  created_at: string;
};

async function requireScriptCatalogRead() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");
  const ok =
    userCanAccessArea(auth.areas, "script") ||
    userCanAccessArea(auth.areas, "produzione");
  if (!ok) notFound();
  return { auth };
}

function mapScript(row: ScriptRow): GestionaleScript | null {
  if (!isScriptFunzione(row.funzione)) return null;
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    descrizione: row.descrizione ?? "",
    funzione: row.funzione,
    attivo: Boolean(row.attivo),
    note: row.note ?? "",
    versione: row.versione,
    documentoStato: row.documento_stato,
    createdAt: row.created_at,
  };
}

export async function listGestionaleScriptAction(): Promise<
  { success: true; items: GestionaleScript[] } | { success: false; error: string }
> {
  await requireScriptCatalogRead();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gestionale_script")
    .select(SCRIPT_COLS)
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as ScriptRow[])
      .map(mapScript)
      .filter((s): s is GestionaleScript => s !== null),
  };
}

export async function listGestionaleScriptAttiviAction(): Promise<
  { success: true; items: GestionaleScript[] } | { success: false; error: string }
> {
  const res = await listGestionaleScriptAction();
  if (!res.success) return res;
  return {
    success: true,
    items: res.items.filter((s) => s.attivo && s.documentoStato !== "chiuso"),
  };
}

export async function createGestionaleScriptAction(
  raw: ScriptInput
): Promise<
  { success: true; item: GestionaleScript } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("script");
  const parsed = scriptInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gestionale_script")
    .insert({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      funzione: parsed.data.funzione,
      note: parsed.data.note?.trim() ?? "",
      attivo: parsed.data.attivo ?? true,
      versione: 1,
      documento_stato: "approvato",
      approvato_at: new Date().toISOString(),
      approvato_by: auth.userId,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(SCRIPT_COLS)
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice script già esistente." };
    }
    return { success: false, error: error.message };
  }
  const item = mapScript(data as ScriptRow);
  if (!item) return { success: false, error: "Script creato ma funzione non valida." };
  void writeAuditLog({
    entity_type: "gestionale_script",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato script ${item.codice}`,
    payload: {
      codice: item.codice,
      nome: item.nome,
      funzione: item.funzione,
    },
  });
  revalidatePath("/app/script/elenco");
  revalidatePath("/app/produzione/processi-e-attivita/elenco-attivita");
  return { success: true, item };
}

export async function updateGestionaleScriptAction(
  id: string,
  raw: ScriptInput
): Promise<
  { success: true; item: GestionaleScript } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("script");
  const parsed = scriptInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data: existing, error: loadErr } = await supabase
    .from("gestionale_script")
    .select("id, documento_stato")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!existing) return { success: false, error: "Script non trovato." };
  if ((existing as { documento_stato: string }).documento_stato === "chiuso") {
    return { success: false, error: "Script chiuso: non modificabile." };
  }

  const { data, error } = await supabase
    .from("gestionale_script")
    .update({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      funzione: parsed.data.funzione,
      note: parsed.data.note?.trim() ?? "",
      attivo: parsed.data.attivo ?? true,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SCRIPT_COLS)
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice script già esistente." };
    }
    return { success: false, error: error.message };
  }
  const item = mapScript(data as ScriptRow);
  if (!item) return { success: false, error: "Script aggiornato ma funzione non valida." };
  void writeAuditLog({
    entity_type: "gestionale_script",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato script ${item.codice}`,
    payload: {
      codice: item.codice,
      nome: item.nome,
      funzione: item.funzione,
      attivo: item.attivo,
    },
  });
  revalidatePath("/app/script/elenco");
  revalidatePath("/app/produzione/processi-e-attivita/elenco-attivita");
  return { success: true, item };
}

export async function softDeleteGestionaleScriptAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("script");
  const supabase = await createClient();
  const { count } = await supabase
    .from("produzione_processo_attivita_script")
    .select("id", { count: "exact", head: true })
    .eq("script_id", id)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) {
    return {
      success: false,
      error:
        "Script ancora collegato a una o più attività. Rimuovilo dalle attività prima di eliminarlo.",
    };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("gestionale_script")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
      attivo: false,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "gestionale_script",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete script gestionale",
    payload: {},
  });
  revalidatePath("/app/script/elenco");
  return { success: true };
}
