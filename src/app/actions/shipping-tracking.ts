"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import {
  checkShippingTrackingSchema,
  createShippingTrackingSchema,
  fetchTrackingStatusHint,
  formatUltimoAggiornamento,
  linkShippingToNotaSchema,
  mapShippingLogRow,
  mapShippingTrackingRow,
  SHIPPING_CHECK_THROTTLE_MS,
  SHIPPING_STATUS_LABEL,
  type ShippingStatus,
  type ShippingTracking,
  type ShippingTrackingLog,
} from "@/lib/shipping/tracking";

async function guardShipping() {
  try {
    return await requireAreaAccess("amministrazione");
  } catch {
    return requireAreaAccess("promemorie-e-note");
  }
}

const TRACKING_SELECT =
  "id, nota_id, entity_type, entity_id, tracking_url, carrier, tracking_code, current_status, last_checked_at, last_check_note, created_at";

export async function createShippingTrackingAction(
  input: unknown
): Promise<
  | { success: true; item: ShippingTracking; checkNote: string }
  | { success: false; error: string }
> {
  const { auth } = await guardShipping();
  const parsed = createShippingTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shipping_trackings")
    .insert({
      nota_id: d.notaId ?? null,
      entity_type: d.entityType ?? null,
      entity_id: d.entityId ?? null,
      tracking_url: d.trackingUrl,
      carrier: d.carrier,
      tracking_code: d.trackingCode || "",
      current_status: "registrato",
      last_check_note: "Creato operatore",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(TRACKING_SELECT)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }

  let item = mapShippingTrackingRow(data as Record<string, unknown>);
  let checkNote = "Creato";

  await supabase.from("shipping_tracking_logs").insert({
    tracking_id: item.id,
    status: "registrato",
    details: {
      event: "created",
      carrier: item.carrier,
      trackingUrl: item.trackingUrl,
    },
    created_by: auth.userId,
  });

  if (d.runCheck) {
    const checked = await runCheckInternal({
      supabase,
      userId: auth.userId,
      tracking: item,
      force: true,
    });
    if (checked.success) {
      item = checked.item;
      checkNote = checked.checkNote;
    }
  }

  await writeAuditLog({
    entity_type: "shipping_tracking",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Tracking ${item.carrier}: ${SHIPPING_STATUS_LABEL[item.currentStatus]}`,
    payload: {
      tracking_url: item.trackingUrl,
      entity_type: item.entityType,
      entity_id: item.entityId,
    },
  });

  return { success: true, item, checkNote };
}

export async function checkShippingTrackingAction(
  input: unknown
): Promise<
  | {
      success: true;
      item: ShippingTracking;
      logs: ShippingTrackingLog[];
      checkNote: string;
      skipped: boolean;
      ultimoAggiornamentoLabel: string;
    }
  | { success: false; error: string }
> {
  const { auth } = await guardShipping();
  const parsed = checkShippingTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_trackings")
    .select(TRACKING_SELECT)
    .eq("id", parsed.data.trackingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Tracking non trovato." };

  const tracking = mapShippingTrackingRow(data as Record<string, unknown>);
  const result = await runCheckInternal({
    supabase,
    userId: auth.userId,
    tracking,
    force: Boolean(parsed.data.force),
    manualStatus: parsed.data.manualStatus,
  });
  if (!result.success) return result;

  const logsRes = await listShippingTrackingLogsAction(tracking.id);
  const logs = logsRes.success ? logsRes.items : [];

  return {
    success: true,
    item: result.item,
    logs,
    checkNote: result.checkNote,
    skipped: result.skipped,
    ultimoAggiornamentoLabel: formatUltimoAggiornamento(
      result.item.lastCheckedAt
    ),
  };
}

export async function getShippingTrackingAction(
  trackingId: string
): Promise<
  | {
      success: true;
      item: ShippingTracking;
      logs: ShippingTrackingLog[];
      ultimoAggiornamentoLabel: string;
    }
  | { success: false; error: string }
> {
  await guardShipping();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_trackings")
    .select(TRACKING_SELECT)
    .eq("id", trackingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Tracking non trovato." };

  const item = mapShippingTrackingRow(data as Record<string, unknown>);
  const logsRes = await listShippingTrackingLogsAction(trackingId);
  return {
    success: true,
    item,
    logs: logsRes.success ? logsRes.items : [],
    ultimoAggiornamentoLabel: formatUltimoAggiornamento(item.lastCheckedAt),
  };
}

export async function listShippingTrackingLogsAction(
  trackingId: string
): Promise<
  { success: true; items: ShippingTrackingLog[] } | { success: false; error: string }
> {
  await guardShipping();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_tracking_logs")
    .select("id, tracking_id, status, details, created_at")
    .eq("tracking_id", trackingId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) =>
      mapShippingLogRow(r as Record<string, unknown>)
    ),
  };
}

export async function linkShippingTrackingsToNotaAction(
  input: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardShipping();
  const parsed = linkShippingToNotaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipping_trackings")
    .update({
      nota_id: parsed.data.notaId,
      updated_by: auth.userId,
    })
    .in("id", parsed.data.trackingIds)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function runCheckInternal(input: {
  supabase: SupabaseClient;
  userId: string;
  tracking: ShippingTracking;
  force: boolean;
  manualStatus?: ShippingStatus;
}): Promise<
  | {
      success: true;
      item: ShippingTracking;
      checkNote: string;
      skipped: boolean;
    }
  | { success: false; error: string }
> {
  const { supabase, userId, tracking, force, manualStatus } = input;

  if (!force && tracking.lastCheckedAt) {
    const age = Date.now() - new Date(tracking.lastCheckedAt).getTime();
    if (Number.isFinite(age) && age < SHIPPING_CHECK_THROTTLE_MS) {
      return {
        success: true,
        item: tracking,
        checkNote: "Check recente: riuso ultimo stato (throttle 15 min).",
        skipped: true,
      };
    }
  }

  const now = new Date().toISOString();
  let status: ShippingStatus = tracking.currentStatus;
  let note = "";
  let details: Record<string, unknown> = {};

  if (manualStatus) {
    status = manualStatus;
    note = `Stato impostato manualmente: ${SHIPPING_STATUS_LABEL[manualStatus]}`;
    details = { event: "manual", status: manualStatus, checkedAt: now };
  } else {
    const hint = await fetchTrackingStatusHint({
      url: tracking.trackingUrl,
      previous: tracking.currentStatus,
    });
    status = hint.status;
    note = hint.note;
    details = { event: "auto_check", ...hint.details };
  }

  const { data: currentRow } = await supabase
    .from("shipping_trackings")
    .select("versione")
    .eq("id", tracking.id)
    .maybeSingle();
  const nextVersione = Math.max(1, Number(currentRow?.versione) || 1) + 1;

  const { data, error } = await supabase
    .from("shipping_trackings")
    .update({
      current_status: status,
      last_checked_at: now,
      last_check_note: note,
      updated_by: userId,
      versione: nextVersione,
    })
    .eq("id", tracking.id)
    .is("deleted_at", null)
    .select(TRACKING_SELECT)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito" };
  }

  await supabase.from("shipping_tracking_logs").insert({
    tracking_id: tracking.id,
    status,
    details: { ...details, note },
    created_by: userId,
  });

  const item = mapShippingTrackingRow(data as Record<string, unknown>);
  return { success: true, item, checkNote: note, skipped: false };
}
