"use server";

import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { writeAuditLog } from "@/lib/audit";
import {
  labelSede,
  parseSedeTipo,
  sedeUpsertSchema,
  type ImpostazioniSede,
} from "@/lib/impostazioni/sedi";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const COLS =
  "id, codice, nome, indirizzo, cap, citta, provincia, nazione, descrizione, tipo_sede, maps_url, lat, lng, attiva";

function mapSede(r: Record<string, unknown>): ImpostazioniSede {
  return {
    id: String(r.id),
    codice: String(r.codice ?? ""),
    nome: String(r.nome ?? ""),
    indirizzo: String(r.indirizzo ?? ""),
    cap: String(r.cap ?? ""),
    citta: String(r.citta ?? ""),
    provincia: String(r.provincia ?? ""),
    nazione: String(r.nazione ?? ""),
    descrizione: String(r.descrizione ?? ""),
    tipoSede: parseSedeTipo(r.tipo_sede),
    mapsUrl: String(r.maps_url ?? ""),
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
    attiva: r.attiva !== false,
  };
}

export async function listSediAttiveAction(): Promise<
  | { success: true; sedi: ImpostazioniSede[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess([
    "impostazioni",
    "amministrazione",
    "produzione",
    "commerciale",
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impostazioni_sedi")
    .select(COLS)
    .is("deleted_at", null)
    .eq("attiva", true)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    sedi: (data ?? []).map((r) => mapSede(r as Record<string, unknown>)),
  };
}

const sedePartenzaSchema = z.object({
  entityType: z.enum(["campionatura", "ordine"]),
  entityId: z.string().uuid(),
  sedeId: z.string().uuid().nullable(),
});

export async function updateSedePartenzaAction(
  raw: unknown
): Promise<
  | { success: true; sedeLabel: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "produzione",
    "commerciale",
  ]);
  const parsed = sedePartenzaSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Sede di partenza non valida." };
  }
  const d = parsed.data;
  const supabase = await createClient();
  let sedeLabel = "";
  if (d.sedeId) {
    const { data: sede, error } = await supabase
      .from("impostazioni_sedi")
      .select(COLS)
      .eq("id", d.sedeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !sede) {
      return { success: false, error: "Sede non trovata nel catalogo." };
    }
    sedeLabel = labelSede(mapSede(sede as Record<string, unknown>));
  }
  const table = d.entityType === "ordine" ? "ordini" : "campionature";
  const { error: updErr } = await supabase
    .from(table)
    .update({
      sede_partenza_id: d.sedeId,
      updated_by: auth.userId,
    })
    .eq("id", d.entityId)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };

  await writeAuditLog({
    entity_type: table,
    entity_id: d.entityId,
    action: "sede_partenza",
    actor_id: auth.userId,
    summary: d.sedeId
      ? `Sede di partenza: ${sedeLabel}`
      : "Sede di partenza rimossa",
    payload: { sede_partenza_id: d.sedeId },
  });
  return { success: true, sedeLabel };
}

function mapsUrlFromCoords(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function cittaDaIndirizzo(indirizzo: string, fallback: string): string {
  if (fallback.trim()) return fallback.trim();
  const parts = indirizzo.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2] ?? "";
  return "";
}

export async function listSediAllAction(): Promise<
  | { success: true; sedi: ImpostazioniSede[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["impostazioni", "amministrazione"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impostazioni_sedi")
    .select(COLS)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    sedi: (data ?? []).map((r) => mapSede(r as Record<string, unknown>)),
  };
}

export async function upsertSedeAction(
  raw: unknown
): Promise<
  | { success: true; sede: ImpostazioniSede }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["impostazioni", "amministrazione"]);
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo amministratori possono registrare le sedi." };
  }
  const parsed = sedeUpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati sede non validi.",
    };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const lat = d.lat ?? null;
  const lng = d.lng ?? null;
  const mapsUrl = d.mapsUrl?.trim() || mapsUrlFromCoords(lat, lng);
  const row = {
    nome: d.nome,
    indirizzo: d.indirizzo,
    descrizione: d.descrizione ?? "",
    tipo_sede: d.tipoSede,
    maps_url: mapsUrl,
    lat,
    lng,
    citta: cittaDaIndirizzo(d.indirizzo, d.citta ?? ""),
    cap: d.cap ?? "",
    provincia: d.provincia ?? "",
    nazione: d.nazione?.trim() || "Italia",
    attiva: d.attiva !== false,
    updated_by: auth.userId,
  };

  if (d.id) {
    const { data, error } = await supabase
      .from("impostazioni_sedi")
      .update(row)
      .eq("id", d.id)
      .is("deleted_at", null)
      .select(COLS)
      .maybeSingle();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Sede non trovata." };
    }
    await writeAuditLog({
      entity_type: "impostazioni_sedi",
      entity_id: d.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Sede aggiornata: ${d.nome}`,
      payload: { tipo_sede: d.tipoSede, maps_url: mapsUrl },
    });
    return { success: true, sede: mapSede(data as Record<string, unknown>) };
  }

  const { data, error } = await supabase
    .from("impostazioni_sedi")
    .insert({
      ...row,
      created_by: auth.userId,
      documento_stato: "approvato",
      versione: 1,
    })
    .select(COLS)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione sede non riuscita." };
  }
  await writeAuditLog({
    entity_type: "impostazioni_sedi",
    entity_id: String((data as { id: string }).id),
    action: "create",
    actor_id: auth.userId,
    summary: `Sede creata: ${d.nome}`,
    payload: { tipo_sede: d.tipoSede },
  });
  return { success: true, sede: mapSede(data as Record<string, unknown>) };
}

export async function softDeleteSedeAction(
  sedeId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["impostazioni", "amministrazione"]);
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo amministratori possono archiviare le sedi." };
  }
  if (!z.string().uuid().safeParse(sedeId).success) {
    return { success: false, error: "Sede non valida." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impostazioni_sedi")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
      attiva: false,
    })
    .eq("id", sedeId)
    .is("deleted_at", null)
    .select("id, nome")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Sede non trovata." };
  }
  await writeAuditLog({
    entity_type: "impostazioni_sedi",
    entity_id: sedeId,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Sede archiviata: ${String((data as { nome?: string }).nome ?? sedeId)}`,
    payload: { deleted: true },
  });
  return { success: true };
}
