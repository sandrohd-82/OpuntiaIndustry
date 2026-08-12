"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  fiscalProfileUpdateSchema,
  mapCompanyFiscalProfileRow,
  profileToAuditPayload,
  type CompanyFiscalProfile,
  type FiscalProfileUpdateInput,
} from "@/lib/amministrazione/fiscal-profile";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type {
  CompanyFiscalProfileAuditRow,
  CompanyFiscalProfileRow,
  FiscalOpenDataCacheRow,
} from "@/types/database";

export async function getCompanyFiscalProfileAction(): Promise<
  | { success: true; profile: CompanyFiscalProfile }
  | { success: false; error: string }
> {
  await requireAreaAccess("impostazioni");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_fiscal_profile")
    .select("*")
    .eq("company_key", "default")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return {
      success: false,
      error:
        "Profilo fiscale non trovato. Esegui la migrazione dashboard fiscale su Supabase.",
    };
  }
  return {
    success: true,
    profile: mapCompanyFiscalProfileRow(data as CompanyFiscalProfileRow),
  };
}

/** Lettura profilo anche da amministrazione (dashboard). */
export async function getFiscalProfileForDashboardAction(): Promise<
  | { success: true; profile: CompanyFiscalProfile }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_fiscal_profile")
    .select("*")
    .eq("company_key", "default")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return {
      success: false,
      error:
        "Profilo fiscale non trovato. Configuralo in Impostazioni dopo la migrazione SQL.",
    };
  }
  return {
    success: true,
    profile: mapCompanyFiscalProfileRow(data as CompanyFiscalProfileRow),
  };
}

export async function updateCompanyFiscalProfileAction(
  input: FiscalProfileUpdateInput
): Promise<
  | { success: true; profile: CompanyFiscalProfile }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("impostazioni");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo admin/superadmin possono modificare il profilo fiscale." };
  }

  const parsed = fiscalProfileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validazione fallita.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const { data: current, error: curErr } = await supabase
    .from("company_fiscal_profile")
    .select("*")
    .eq("company_key", "default")
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr) return { success: false, error: curErr.message };
  if (!current) {
    return { success: false, error: "Profilo fiscale assente." };
  }
  const prev = mapCompanyFiscalProfileRow(current as CompanyFiscalProfileRow);

  const { data: updated, error } = await supabase
    .from("company_fiscal_profile")
    .update({
      forma_giuridica: v.formaGiuridica,
      regime_iva: v.regimeIva,
      iva_periodo: v.ivaPeriodo,
      cooperativa_sociale_l381: v.cooperativaSocialeL381,
      zona_svantaggiata: v.zonaSvantaggiata,
      otd_count: v.otdCount,
      oti_count: v.otiCount,
      tipi_colture: v.tipiColture,
      inps_parametri: v.inpsParametri,
      aliquota_ires_pct: v.aliquotaIresPct,
      aliquota_irap_pct: v.aliquotaIrapPct,
      aliquota_stima_generica_pct: v.aliquotaStimaGenericaPct,
      note: (v.note ?? "").trim(),
      open_data_enabled: Boolean(v.openDataEnabled),
      versione: prev.versione + 1,
      updated_by: auth.userId,
    })
    .eq("id", prev.id)
    .select("*")
    .single();

  if (error || !updated) {
    return {
      success: false,
      error: error?.message ?? "Aggiornamento profilo non riuscito.",
    };
  }

  const next = mapCompanyFiscalProfileRow(updated as CompanyFiscalProfileRow);

  const { error: auditErr } = await supabase
    .from("company_fiscal_profile_audit")
    .insert({
      profile_id: prev.id,
      changed_by: auth.userId,
      reason_for_change: v.reasonForChange,
      previous_payload: profileToAuditPayload(prev),
      next_payload: profileToAuditPayload(next),
    });
  if (auditErr) {
    console.error("[company_fiscal_profile_audit]", auditErr.message);
  }

  await writeAuditLog({
    entity_type: "company_fiscal_profile",
    entity_id: prev.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato profilo fiscale v${next.versione}: ${v.reasonForChange}`,
    payload: {
      reason_for_change: v.reasonForChange,
      versione: next.versione,
    },
  });

  return { success: true, profile: next };
}

export async function listFiscalProfileAuditAction(): Promise<
  | {
      success: true;
      rows: Array<{
        id: string;
        changedAt: string;
        changedBy: string | null;
        reasonForChange: string;
        versioneNext: number | null;
      }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("impostazioni");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_fiscal_profile_audit")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(30);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    rows: ((data ?? []) as CompanyFiscalProfileAuditRow[]).map((r) => ({
      id: r.id,
      changedAt: r.changed_at,
      changedBy: r.changed_by,
      reasonForChange: r.reason_for_change,
      versioneNext:
        typeof (r.next_payload as { versione?: number })?.versione === "number"
          ? (r.next_payload as { versione: number }).versione
          : null,
    })),
  };
}

export async function listFiscalOpenDataCacheAction(): Promise<
  | {
      success: true;
      sources: Array<{
        sourceKey: string;
        sourceLabel: string;
        sourceUrl: string;
        fetchedAt: string;
        note: string;
      }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("impostazioni");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fiscal_open_data_cache")
    .select("*")
    .order("source_key");
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    sources: ((data ?? []) as FiscalOpenDataCacheRow[]).map((r) => ({
      sourceKey: r.source_key,
      sourceLabel: r.source_label,
      sourceUrl: r.source_url,
      fetchedAt: r.fetched_at,
      note: r.note,
    })),
  };
}

/** Refresh placeholder open data (predisposizione sync ufficiale). */
export async function refreshFiscalOpenDataPlaceholderAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("impostazioni");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Permesso negato." };
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("fiscal_open_data_cache")
    .update({
      fetched_at: now,
      note: "Refresh locale placeholder — collegare feed ufficiale AdE/INPS.",
      payload: {
        stato: "placeholder_refreshed",
        refreshed_at: now,
      },
    })
    .neq("source_key", "");
  if (error) return { success: false, error: error.message };

  await supabase
    .from("company_fiscal_profile")
    .update({
      open_data_last_sync_at: now,
      open_data_last_payload: { refreshed_at: now, mode: "placeholder" },
      updated_by: auth.userId,
    })
    .eq("company_key", "default")
    .is("deleted_at", null);

  return { success: true };
}
