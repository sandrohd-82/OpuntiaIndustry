"use server";

import { convertClientePossibileAdClienteAction } from "@/app/actions/clienti";
import { updateClientePossibileAction } from "@/app/actions/promemorie-e-note";
import { writeAuditLog } from "@/lib/audit";
import { normalizeVatKey } from "@/lib/amministrazione/fic-anagrafiche";
import type { LeadPromozioneAperta } from "@/lib/amministrazione/lead-promozione";
import type { ClienteInput } from "@/lib/amministrazione/clienti";
import { assertAnagraficaPrivilege } from "@/lib/auth/anagrafica-privileges-server";
import { getAuthContext } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

type FicHint = {
  ficId: number;
  number: string;
  date: string | null;
  amountGross: number;
  entityVat: string;
};

async function upsertPromozioneAperta(input: {
  leadId: string;
  actorId: string;
  fatturaEmessaId?: string | null;
  ficId?: number | null;
  numeroFattura?: string;
  dataFattura?: string | null;
  totale?: number | null;
  partitaIva?: string;
}): Promise<string | null> {
  const service = createServiceClient();
  const { data: existing } = await service
    .from("clienti_possibili_promozioni")
    .select("id, fattura_emessa_id, fic_id, numero_fattura")
    .eq("cliente_possibile_id", input.leadId)
    .eq("stato", "aperta")
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { updated_by: input.actorId };
    if (!existing.fattura_emessa_id && input.fatturaEmessaId) {
      patch.fattura_emessa_id = input.fatturaEmessaId;
    }
    if (existing.fic_id == null && input.ficId) patch.fic_id = input.ficId;
    if (!String(existing.numero_fattura ?? "").trim() && input.numeroFattura) {
      patch.numero_fattura = input.numeroFattura;
    }
    if (Object.keys(patch).length > 1) {
      await service
        .from("clienti_possibili_promozioni")
        .update(patch)
        .eq("id", existing.id);
    }
    return String(existing.id);
  }
  const { data, error } = await service
    .from("clienti_possibili_promozioni")
    .insert({
      cliente_possibile_id: input.leadId,
      fattura_emessa_id: input.fatturaEmessaId ?? null,
      fic_id: input.ficId ?? null,
      numero_fattura: input.numeroFattura ?? "",
      data_fattura: input.dataFattura || null,
      totale: input.totale ?? null,
      partita_iva: input.partitaIva ?? "",
      stato: "aperta",
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[lead-promozione] upsert", error?.message);
    return null;
  }
  await writeAuditLog({
    entity_type: "clienti_possibili_promozioni",
    entity_id: String(data.id),
    action: "create",
    actor_id: input.actorId,
    summary: `Fattura rilevata: attende promozione a cliente`,
    payload: {
      lead_id: input.leadId,
      fattura_emessa_id: input.fatturaEmessaId ?? null,
      fic_id: input.ficId ?? null,
      numero_fattura: input.numeroFattura ?? "",
    },
  });
  return String(data.id);
}

export async function scanPromozioniDaFattureAction(
  extras?: { ficDocs?: FicHint[] }
): Promise<{ opened: number } | { success: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth) return { success: false, error: "Non autenticato." };
  const service = createServiceClient();

  const { data: leads, error: leadErr } = await service
    .from("clienti_possibili")
    .select("id, partita_iva, codice_fiscale, stato")
    .is("deleted_at", null)
    .neq("stato", "convertito")
    .neq("stato", "scartato");
  if (leadErr) return { success: false, error: leadErr.message };

  const leadByVat = new Map<string, string>();
  for (const row of leads ?? []) {
    const vat = normalizeVatKey(String(row.partita_iva ?? ""));
    const cf = normalizeVatKey(String(row.codice_fiscale ?? ""));
    if (vat) leadByVat.set(vat, String(row.id));
    if (cf && !leadByVat.has(cf)) leadByVat.set(cf, String(row.id));
  }
  if (leadByVat.size === 0) return { opened: 0 };

  const { data: fatture } = await service
    .from("fatture_emesse")
    .select(
      "id, cliente_id, numero_fattura, numero_interno, data_emissione, totale, fic_id"
    )
    .is("deleted_at", null)
    .limit(4000);
  const clienteIds = [
    ...new Set(
      (fatture ?? []).map((f) => String(f.cliente_id ?? "")).filter(Boolean)
    ),
  ];
  const vatByCliente = new Map<string, string>();
  if (clienteIds.length > 0) {
    const { data: clienti } = await service
      .from("clienti")
      .select("id, partita_iva, codice_fiscale")
      .in("id", clienteIds)
      .is("deleted_at", null);
    for (const c of clienti ?? []) {
      const vat = normalizeVatKey(String(c.partita_iva ?? ""));
      const cf = normalizeVatKey(String(c.codice_fiscale ?? ""));
      if (vat) vatByCliente.set(String(c.id), vat);
      else if (cf) vatByCliente.set(String(c.id), cf);
    }
  }

  let opened = 0;
  for (const f of fatture ?? []) {
    const vat = vatByCliente.get(String(f.cliente_id ?? ""));
    if (!vat) continue;
    const leadId = leadByVat.get(vat);
    if (!leadId) continue;
    const id = await upsertPromozioneAperta({
      leadId,
      actorId: auth.userId,
      fatturaEmessaId: String(f.id),
      ficId: f.fic_id != null ? Number(f.fic_id) : null,
      numeroFattura: String(f.numero_fattura || f.numero_interno || ""),
      dataFattura: f.data_emissione ? String(f.data_emissione) : null,
      totale: f.totale != null ? Number(f.totale) : null,
      partitaIva: vat,
    });
    if (id) opened += 1;
  }

  for (const doc of extras?.ficDocs ?? []) {
    const vat = normalizeVatKey(doc.entityVat);
    if (!vat) continue;
    const leadId = leadByVat.get(vat);
    if (!leadId) continue;
    const id = await upsertPromozioneAperta({
      leadId,
      actorId: auth.userId,
      ficId: doc.ficId,
      numeroFattura: doc.number || "",
      dataFattura: doc.date,
      totale: doc.amountGross,
      partitaIva: vat,
    });
    if (id) opened += 1;
  }

  return { opened };
}

export async function listMiePromozioniAperteAction(): Promise<
  | { success: true; items: LeadPromozioneAperta[] }
  | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth) return { success: false, error: "Non autenticato." };

  await scanPromozioniDaFattureAction();

  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("clienti_possibili_promozioni")
    .select(
      "id, cliente_possibile_id, numero_fattura, data_fattura, totale, fic_id, fattura_emessa_id, partita_iva"
    )
    .eq("stato", "aperta")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(40);
  if (error) return { success: false, error: error.message };
  if (!rows?.length) return { success: true, items: [] };

  const leadIds = [...new Set(rows.map((r) => String(r.cliente_possibile_id)))];
  const { data: leads } = await service
    .from("clienti_possibili")
    .select("id, ragione_sociale, partita_iva, created_by, commerciale_id, stato")
    .in("id", leadIds)
    .is("deleted_at", null);
  const leadById = new Map(
    (leads ?? []).map((l) => [String(l.id), l] as const)
  );

  const items: LeadPromozioneAperta[] = [];
  for (const row of rows) {
    const lead = leadById.get(String(row.cliente_possibile_id));
    if (!lead || String(lead.stato) === "convertito") continue;
    const gate = await assertAnagraficaPrivilege({
      kind: "cliente_possibile",
      op: "update",
      createdBy: lead.created_by ? String(lead.created_by) : null,
      commercialeId: lead.commerciale_id ? String(lead.commerciale_id) : null,
    });
    if (!gate.ok) continue;
    items.push({
      id: String(row.id),
      leadId: String(lead.id),
      ragioneSociale: String(lead.ragione_sociale ?? ""),
      partitaIva: String(lead.partita_iva || row.partita_iva || ""),
      numeroFattura: String(row.numero_fattura ?? ""),
      dataFattura: row.data_fattura ? String(row.data_fattura) : null,
      totale: row.totale != null ? Number(row.totale) : null,
      ficId: row.fic_id != null ? Number(row.fic_id) : null,
      fatturaEmessaId: row.fattura_emessa_id
        ? String(row.fattura_emessa_id)
        : null,
    });
  }
  return { success: true, items };
}

export async function confirmPromozioneLeadAction(input: {
  promozioneId: string;
  leadId: string;
  values: ClienteInput;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth) return { success: false, error: "Non autenticato." };

  const service = createServiceClient();
  const { data: pratica } = await service
    .from("clienti_possibili_promozioni")
    .select("id, cliente_possibile_id, stato")
    .eq("id", input.promozioneId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pratica || String(pratica.cliente_possibile_id) !== input.leadId) {
    return { success: false, error: "Pratica di promozione non trovata." };
  }
  if (String(pratica.stato) !== "aperta") {
    return { success: false, error: "La pratica non è più aperta." };
  }

  const updated = await updateClientePossibileAction(input.leadId, input.values);
  if (!updated.success) return updated;

  const converted = await convertClientePossibileAdClienteAction(input.leadId);
  if (!converted.success) return converted;

  const now = new Date().toISOString();
  await service
    .from("clienti_possibili_promozioni")
    .update({
      stato: "completata",
      cliente_id: converted.cliente.id,
      completed_at: now,
      completed_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.promozioneId)
    .is("deleted_at", null);

  await service
    .from("campionature")
    .update({
      cliente_id: converted.cliente.id,
      cliente_codice_targa: converted.cliente.codiceTarga,
      updated_by: auth.userId,
    })
    .eq("cliente_possibile_id", input.leadId)
    .is("deleted_at", null);

  await service
    .from("ordini")
    .update({
      cliente_id: converted.cliente.id,
      cliente_codice_targa: converted.cliente.codiceTarga,
      updated_by: auth.userId,
    })
    .eq("cliente_possibile_id", input.leadId)
    .is("deleted_at", null);

  await writeAuditLog({
    entity_type: "clienti_possibili_promozioni",
    entity_id: input.promozioneId,
    action: "update",
    actor_id: auth.userId,
    summary: `Possibile cliente promosso a ${converted.cliente.codiceTarga} ${converted.cliente.ragioneSociale}`,
    payload: {
      lead_id: input.leadId,
      cliente_id: converted.cliente.id,
      codice_targa: converted.cliente.codiceTarga,
    },
  });

  return { success: true };
}
