"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireOrdineProcessAccess } from "@/lib/auth/ordini-access";
import {
  corriereCreateSchema,
  forzaConsegnaSchema,
  ritiroSchema,
  type InAttesaRitiroRiga,
  type ProduzioneCorriere,
} from "@/lib/produzione/corrieri";
import {
  appendSchedaTimeline,
  chiudiSchedaPerConsegna,
  ensureSchedaOrdine,
  loadSchedaDettaglio,
} from "@/lib/produzione/schede-ordini-store";
import { inferCarrierFromUrl } from "@/lib/shipping/tracking";
import { createClient } from "@/lib/supabase/server";

export async function listCorrieriAction(): Promise<
  | { success: true; corrieri: ProduzioneCorriere[] }
  | { success: false; error: string }
> {
  await requireOrdineProcessAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_corrieri")
    .select("id, nome, predefinito")
    .is("deleted_at", null)
    .eq("attiva", true)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    corrieri: (data ?? []).map((r) => ({
      id: String(r.id),
      nome: String(r.nome ?? ""),
      predefinito: r.predefinito === true,
    })),
  };
}

export async function createCorriereAction(
  raw: unknown
): Promise<
  | { success: true; corriere: ProduzioneCorriere }
  | { success: false; error: string }
> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = corriereCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Nome corriere non valido.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_corrieri")
    .insert({
      nome: parsed.data.nome,
      attiva: true,
      sort_order: 200,
      predefinito: false,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, nome, predefinito")
    .maybeSingle();
  if (error || !data) {
    return {
      success: false,
      error: error?.message?.includes("produzione_corrieri_nome")
        ? "Questo corriere è già in elenco."
        : error?.message ?? "Creazione corriere non riuscita.",
    };
  }
  await writeAuditLog({
    entity_type: "produzione_corrieri",
    entity_id: String(data.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Corriere aggiunto: ${parsed.data.nome}`,
  });
  return {
    success: true,
    corriere: {
      id: String(data.id),
      nome: String(data.nome ?? ""),
      predefinito: false,
    },
  };
}

export async function listInAttesaRitiroAction(): Promise<
  | { success: true; righe: InAttesaRitiroRiga[] }
  | { success: false; error: string }
> {
  const { auth } = await requireOrdineProcessAccess();
  const supabase = await createClient();
  const { data: ords, error: oErr } = await supabase
    .from("ordini")
    .select("id, numero_interno, cliente_ragione_sociale, updated_at")
    .eq("stato", "pronto_spedizione")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (oErr) return { success: false, error: oErr.message };
  const { data: camps, error: cErr } = await supabase
    .from("campionature")
    .select("id, numero_interno, cliente_ragione_sociale, updated_at")
    .eq("stato", "pronto_spedizione")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (cErr) return { success: false, error: cErr.message };

  const righe: InAttesaRitiroRiga[] = [];
  for (const o of ords ?? []) {
    const { data: riga } = await supabase
      .from("ordini_righe")
      .select("prodotto_codice")
      .eq("ordine_id", o.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const scheda = await ensureSchedaOrdine(supabase, {
      ordineId: String(o.id),
      numero: String(o.numero_interno ?? ""),
      cliente: String(o.cliente_ragione_sociale ?? ""),
      prodotto: String(riga?.prodotto_codice ?? ""),
      userId: auth.userId,
    });
    if (!scheda) continue;
    righe.push({
      schedaId: scheda.id,
      numero: String(o.numero_interno ?? ""),
      cliente: String(o.cliente_ragione_sociale ?? ""),
      prodotto: String(riga?.prodotto_codice ?? ""),
      entityTipo: "ordine",
      entityId: String(o.id),
      prontoAt: o.updated_at ? String(o.updated_at) : null,
    });
  }
  for (const c of camps ?? []) {
    const { data: riga } = await supabase
      .from("campionature_righe")
      .select("prodotto_codice")
      .eq("campionatura_id", c.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const scheda = await ensureSchedaOrdine(supabase, {
      campionaturaId: String(c.id),
      numero: String(c.numero_interno ?? ""),
      cliente: String(c.cliente_ragione_sociale ?? ""),
      prodotto: String(riga?.prodotto_codice ?? ""),
      userId: auth.userId,
    });
    if (!scheda) continue;
    righe.push({
      schedaId: scheda.id,
      numero: String(c.numero_interno ?? ""),
      cliente: String(c.cliente_ragione_sociale ?? ""),
      prodotto: String(riga?.prodotto_codice ?? ""),
      entityTipo: "campionatura",
      entityId: String(c.id),
      prontoAt: c.updated_at ? String(c.updated_at) : null,
    });
  }
  righe.sort((a, b) => String(b.prontoAt ?? "").localeCompare(String(a.prontoAt ?? "")));
  return { success: true, righe };
}

function parseRitiroAt(raw: string): string | null {
  const t = raw.trim();
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function registraRitiroAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = ritiroSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati ritiro non validi.",
    };
  }
  const ritiroAt = parseRitiroAt(parsed.data.ritiroAt);
  if (!ritiroAt) return { success: false, error: "Ora di ritiro non valida." };

  const supabase = await createClient();
  const det = await loadSchedaDettaglio(supabase, parsed.data.schedaId);
  if (!det) return { success: false, error: "Scheda non trovata." };
  const { data: corriere } = await supabase
    .from("produzione_corrieri")
    .select("id, nome")
    .eq("id", parsed.data.corriereId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!corriere) return { success: false, error: "Corriere non trovato." };

  const patch = {
    ritiro_at: ritiroAt,
    ritiro_by: auth.userId,
    corriere_id: String(corriere.id),
    corriere_nome: String(corriere.nome ?? ""),
    updated_by: auth.userId,
  };

  if (det.scheda.ordineId) {
    const { data: ord } = await supabase
      .from("ordini")
      .select("stato")
      .eq("id", det.scheda.ordineId)
      .maybeSingle();
    if (String(ord?.stato ?? "") !== "pronto_spedizione") {
      return { success: false, error: "Questo ordine non è in attesa di ritiro." };
    }
    const { error } = await supabase
      .from("ordini")
      .update({ ...patch, stato: "inviato" })
      .eq("id", det.scheda.ordineId)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    const { data: mail } = await supabase
      .from("spedizione_mail_prenotazioni")
      .select("tracking_url")
      .eq("entity_type", "ordine")
      .eq("entity_id", det.scheda.ordineId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const url = String(mail?.tracking_url ?? "").trim();
    if (url) {
      await ensureTrackingRow(supabase, {
        entityType: "ordine",
        entityId: det.scheda.ordineId,
        url,
        corriere: String(corriere.nome),
        userId: auth.userId,
      });
    }
    await writeAuditLog({
      entity_type: "ordini",
      entity_id: det.scheda.ordineId,
      action: "status_change",
      actor_id: auth.userId,
      summary: `Ritiro ${corriere.nome} · Concluso`,
      payload: { stato_a: "inviato", ritiro_at: ritiroAt },
    });
  } else if (det.scheda.campionaturaId) {
    const { data: camp } = await supabase
      .from("campionature")
      .select("stato, tracking_url")
      .eq("id", det.scheda.campionaturaId)
      .maybeSingle();
    if (String(camp?.stato ?? "") !== "pronto_spedizione") {
      return { success: false, error: "Questa campionatura non è in attesa di ritiro." };
    }
    const { error } = await supabase
      .from("campionature")
      .update({ ...patch, stato: "inviata" })
      .eq("id", det.scheda.campionaturaId)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    const url = String(camp?.tracking_url ?? "").trim();
    if (url) {
      await ensureTrackingRow(supabase, {
        entityType: "campionatura",
        entityId: det.scheda.campionaturaId,
        url,
        corriere: String(corriere.nome),
        userId: auth.userId,
      });
    }
    await writeAuditLog({
      entity_type: "campionature",
      entity_id: det.scheda.campionaturaId,
      action: "status_change",
      actor_id: auth.userId,
      summary: `Ritiro ${corriere.nome} · Concluso`,
      payload: { stato_a: "inviata", ritiro_at: ritiroAt },
    });
  } else {
    return { success: false, error: "Scheda senza documento collegato." };
  }

  const quando = new Date(ritiroAt).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
  await appendSchedaTimeline(supabase, {
    schedaId: det.scheda.id,
    eventoTipo: "ritiro",
    titolo: `Ritirato da ${corriere.nome} · ${quando}`,
    dettaglio: "Ora di ritiro registrata dall’operatore.",
    actorId: auth.userId,
    payload: { corriere_id: corriere.id, ritiro_at: ritiroAt },
  });
  await appendSchedaTimeline(supabase, {
    schedaId: det.scheda.id,
    eventoTipo: "concluso",
    titolo: `Ordine concluso · ${det.scheda.numeroScheda}`,
    dettaglio: "In viaggio. Resta aperto fino a consegna.",
    actorId: auth.userId,
  });
  return { success: true };
}

export async function forzaConsegnaSchedaAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = forzaConsegnaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Motivo obbligatorio.",
    };
  }
  const supabase = await createClient();
  const det = await loadSchedaDettaglio(supabase, parsed.data.schedaId);
  if (!det) return { success: false, error: "Scheda non trovata." };

  const entityType = det.scheda.ordineId ? "ordine" : "campionatura";
  const entityId = det.scheda.ordineId || det.scheda.campionaturaId;
  if (entityId) {
    const { data: track } = await supabase
      .from("shipping_trackings")
      .select("id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (track?.id) {
      await supabase
        .from("shipping_trackings")
        .update({
          current_status: "consegnato",
          last_checked_at: new Date().toISOString(),
          last_check_note: `Consegna forzata: ${parsed.data.motivo}`,
          updated_by: auth.userId,
        })
        .eq("id", track.id);
      await supabase.from("shipping_tracking_logs").insert({
        tracking_id: track.id,
        status: "consegnato",
        details: { event: "force_delivered", motivo: parsed.data.motivo },
        created_by: auth.userId,
      });
    }
  }

  await chiudiSchedaPerConsegna(supabase, {
    scheda: det.scheda,
    userId: auth.userId,
    fonte: "forzata",
    nota: parsed.data.motivo,
  });
  await writeAuditLog({
    entity_type: det.scheda.ordineId ? "ordini" : "campionature",
    entity_id: entityId || det.scheda.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: "Consegna forzata · ordine chiuso",
    payload: { motivo: parsed.data.motivo },
  });
  return { success: true };
}

async function ensureTrackingRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    entityType: "ordine" | "campionatura";
    entityId: string;
    url: string;
    corriere: string;
    userId: string;
  }
) {
  const { data: existing } = await supabase
    .from("shipping_trackings")
    .select("id")
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing?.id) return;
  await supabase.from("shipping_trackings").insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    tracking_url: input.url,
    carrier: input.corriere || inferCarrierFromUrl(input.url),
    tracking_code: "",
    current_status: "registrato",
    last_check_note: "Collegato al ritiro",
    created_by: input.userId,
    updated_by: input.userId,
  });
}
