"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import {
  lookupCanaleAttenzioneSchema,
  lookupManyCanaleAttenzioneSchema,
  normalizeCanaleValore,
  upsertCanaleAttenzioneSchema,
  type ContattoCanaleAttenzione,
  type ContattoCanaleKind,
} from "@/lib/amministrazione/contatto-canale-attenzione";
import { createClient } from "@/lib/supabase/server";

function mapRow(r: Record<string, unknown>): ContattoCanaleAttenzione {
  return {
    id: String(r.id),
    canale: r.canale as ContattoCanaleKind,
    valoreNormalizzato: String(r.valore_normalizzato ?? ""),
    valoreDisplay: String(r.valore_display ?? ""),
    clausola: String(r.clausola ?? ""),
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

async function requireContattoCanaleAccess() {
  return requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
    "webmail",
  ]);
}

export async function lookupContattoCanaleAttenzioneAction(
  raw: unknown
): Promise<
  | { success: true; item: ContattoCanaleAttenzione | null }
  | { success: false; error: string }
> {
  await requireContattoCanaleAccess();
  const parsed = lookupCanaleAttenzioneSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Valore contatto non valido." };
  }
  const valore = normalizeCanaleValore(parsed.data.canale, parsed.data.valore);
  if (!valore) return { success: true, item: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contatto_canale_attenzioni")
    .select(
      "id, canale, valore_normalizzato, valore_display, clausola, updated_at"
    )
    .eq("canale", parsed.data.canale)
    .eq("valore_normalizzato", valore)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, item: data ? mapRow(data) : null };
}

export async function lookupManyContattoCanaleAttenzioniAction(
  raw: unknown
): Promise<
  | { success: true; items: ContattoCanaleAttenzione[] }
  | { success: false; error: string }
> {
  await requireContattoCanaleAccess();
  const parsed = lookupManyCanaleAttenzioneSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Elenco contatti non valido." };
  }
  const emails = [
    ...new Set(
      parsed.data.emails
        .map((e) => normalizeCanaleValore("email", e))
        .filter((e) => e.includes("@"))
    ),
  ];
  const telefoni = [
    ...new Set(
      parsed.data.telefoni
        .map((t) => normalizeCanaleValore("telefono", t))
        .filter(Boolean)
    ),
  ];
  if (emails.length === 0 && telefoni.length === 0) {
    return { success: true, items: [] };
  }

  const supabase = await createClient();
  const items: ContattoCanaleAttenzione[] = [];
  if (emails.length > 0) {
    const { data, error } = await supabase
      .from("contatto_canale_attenzioni")
      .select(
        "id, canale, valore_normalizzato, valore_display, clausola, updated_at"
      )
      .eq("canale", "email")
      .in("valore_normalizzato", emails)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    for (const r of data ?? []) items.push(mapRow(r));
  }
  if (telefoni.length > 0) {
    const { data, error } = await supabase
      .from("contatto_canale_attenzioni")
      .select(
        "id, canale, valore_normalizzato, valore_display, clausola, updated_at"
      )
      .eq("canale", "telefono")
      .in("valore_normalizzato", telefoni)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    for (const r of data ?? []) items.push(mapRow(r));
  }
  return { success: true, items };
}

export async function upsertContattoCanaleAttenzioneAction(
  raw: unknown
): Promise<
  | { success: true; item: ContattoCanaleAttenzione }
  | { success: false; error: string }
> {
  const { auth } = await requireContattoCanaleAccess();
  const parsed = upsertCanaleAttenzioneSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const valore = normalizeCanaleValore(parsed.data.canale, parsed.data.valore);
  if (!valore) {
    return { success: false, error: "Inserisci prima mail o telefono." };
  }
  if (parsed.data.canale === "email" && !valore.includes("@")) {
    return { success: false, error: "Indirizzo email non valido." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("contatto_canale_attenzioni")
    .select("id")
    .eq("canale", parsed.data.canale)
    .eq("valore_normalizzato", valore)
    .is("deleted_at", null)
    .maybeSingle();

  const patch = {
    valore_display: parsed.data.valore.trim(),
    clausola: parsed.data.clausola,
    updated_by: auth.userId,
    deleted_at: null,
    deleted_by: null,
  };

  let row: Record<string, unknown> | null = null;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("contatto_canale_attenzioni")
      .update(patch)
      .eq("id", existing.id)
      .select(
        "id, canale, valore_normalizzato, valore_display, clausola, updated_at"
      )
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Salvataggio fallito." };
    }
    row = data;
  } else {
    const { data, error } = await supabase
      .from("contatto_canale_attenzioni")
      .insert({
        canale: parsed.data.canale,
        valore_normalizzato: valore,
        valore_display: parsed.data.valore.trim(),
        clausola: parsed.data.clausola,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select(
        "id, canale, valore_normalizzato, valore_display, clausola, updated_at"
      )
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Salvataggio fallito." };
    }
    row = data;
  }

  const item = mapRow(row);
  await writeAuditLog({
    entity_type: "contatto_canale_attenzioni",
    entity_id: item.id,
    action: existing?.id ? "update" : "create",
    actor_id: auth.userId,
    summary: `Attenzione ${parsed.data.canale} ${valore}`,
    payload: {
      canale: parsed.data.canale,
      valore,
      clausola: parsed.data.clausola,
    },
  });
  return { success: true, item };
}

export async function clearContattoCanaleAttenzioneAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireContattoCanaleAccess();
  const parsed = lookupCanaleAttenzioneSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Valore contatto non valido." };
  }
  const valore = normalizeCanaleValore(parsed.data.canale, parsed.data.valore);
  if (!valore) return { success: true };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("contatto_canale_attenzioni")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("canale", parsed.data.canale)
    .eq("valore_normalizzato", valore)
    .is("deleted_at", null)
    .select("id");
  if (error) return { success: false, error: error.message };

  const id = data?.[0]?.id;
  if (id) {
    await writeAuditLog({
      entity_type: "contatto_canale_attenzioni",
      entity_id: String(id),
      action: "soft_delete",
      actor_id: auth.userId,
      summary: `Rimossa attenzione ${parsed.data.canale} ${valore}`,
      payload: { canale: parsed.data.canale, valore },
    });
  }
  return { success: true };
}
