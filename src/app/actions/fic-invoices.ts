"use server";

import {
  fetchIssuedInvoices,
  fetchReceivedInvoices,
  getFicConfig,
  peekFicEnv,
  type FicDocumentNormalized,
} from "@/lib/fic";
import {
  mapFicInvoiceRow,
  type FicInvoice,
} from "@/lib/amministrazione/fic-invoices";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type { FicInvoiceKind, FicInvoiceRow } from "@/types/database";

export type FicSyncResult = {
  success: true;
  fetched: number;
  upserted: number;
  sinceAt: string | null;
  logId: string;
};

export type FicSyncError = {
  success: false;
  error: string;
};

/** Diagnostica sicura: non espone il token, solo se Vercel lo vede. */
export async function checkFicEnvAction(): Promise<{
  success: true;
  hasToken: boolean;
  hasCompanyId: boolean;
  tokenLength: number;
  companyIdPreview: string;
}> {
  await requireAreaAccess("amministrazione");
  return { success: true, ...peekFicEnv() };
}

export async function listFicInvoicesAction(
  type: FicInvoiceKind
): Promise<
  | { success: true; invoices: FicInvoice[]; lastSyncAt: string | null }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fic_invoices")
    .select("*")
    .eq("type", type)
    .is("deleted_at", null)
    .order("date", { ascending: false, nullsFirst: false })
    .order("number", { ascending: false });

  if (error) {
    return {
      success: false,
      error: `Non riesco a leggere le fatture salvate. (${error.message})`,
    };
  }

  const { data: lastLog } = await supabase
    .from("fic_sync_logs")
    .select("finished_at")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    success: true,
    invoices: ((data ?? []) as FicInvoiceRow[]).map(mapFicInvoiceRow),
    lastSyncAt: lastLog?.finished_at ?? null,
  };
}

async function resolveSinceAt(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Date | null> {
  const { data } = await supabase
    .from("fic_sync_logs")
    .select("finished_at")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.finished_at) return new Date(data.finished_at);
  return null;
}

async function upsertDocuments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  docs: FicDocumentNormalized[]
): Promise<number> {
  if (docs.length === 0) return 0;
  const now = new Date().toISOString();
  let upserted = 0;

  // Batch da 50 per non sforare limiti payload
  for (let i = 0; i < docs.length; i += 50) {
    const chunk = docs.slice(i, i + 50);
    const rows = chunk.map((d) => ({
      fic_id: d.ficId,
      type: d.type,
      number: d.number,
      entity_name: d.entityName,
      entity_vat: d.entityVat,
      amount_gross: d.amountGross,
      date: d.date,
      due_date: d.dueDate,
      status: d.status,
      raw_data: d.raw,
      last_synced_at: now,
      updated_by: userId,
      deleted_at: null,
      deleted_by: null,
    }));

    const { error, count } = await supabase.from("fic_invoices").upsert(rows, {
      onConflict: "fic_id,type",
      count: "exact",
    });

    if (error) {
      throw new Error(`Salvataggio fatture fallito: ${error.message}`);
    }
    upserted += count ?? chunk.length;
  }

  // Solo le righe nuove (created_by ancora vuoto) ricevono l’operatore
  await supabase
    .from("fic_invoices")
    .update({ created_by: userId })
    .is("created_by", null)
    .is("deleted_at", null);

  return upserted;
}

/**
 * Sync differenziale: chiede a Fatture in Cloud solo i documenti
 * modificati dopo l’ultimo sync riuscito, poi li salva in locale.
 */
export async function syncFattureInCloudAction(): Promise<
  FicSyncResult | FicSyncError
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  try {
    getFicConfig();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Configurazione FiC mancante.",
    };
  }

  const since = await resolveSinceAt(supabase);
  const sinceIso = since?.toISOString() ?? null;

  const { data: logRow, error: logErr } = await supabase
    .from("fic_sync_logs")
    .insert({
      status: "running",
      since_at: sinceIso,
      created_by: auth.userId,
      details: { mode: "differential" },
    })
    .select("id")
    .single();

  if (logErr || !logRow) {
    return {
      success: false,
      error: `Non riesco ad aprire il registro di sync. (${logErr?.message ?? "errore"})`,
    };
  }

  const logId = logRow.id as string;

  try {
    const [issued, received] = await Promise.all([
      fetchIssuedInvoices(since),
      fetchReceivedInvoices(since),
    ]);
    const all = [...issued, ...received];
    const upserted = await upsertDocuments(supabase, auth.userId, all);

    await supabase
      .from("fic_sync_logs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        documents_fetched: all.length,
        documents_upserted: upserted,
        details: {
          mode: "differential",
          issued: issued.length,
          received: received.length,
        },
      })
      .eq("id", logId);

    return {
      success: true,
      fetched: all.length,
      upserted,
      sinceAt: sinceIso,
      logId,
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Errore sconosciuto durante il sync.";
    await supabase
      .from("fic_sync_logs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: message.slice(0, 2000),
      })
      .eq("id", logId);

    return { success: false, error: message };
  }
}
