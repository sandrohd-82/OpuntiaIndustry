"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  lookupAccordoPrezzoSchema,
  saveAccordiPrezzoSchema,
  valoreOrigineAccordo,
  type AccordoPrezzoAziendaTipo,
  type AccordoPrezzoProdotto,
} from "@/lib/amministrazione/accordi-prezzo";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  prodotto_codice: string;
  modalita: "sconto_percentuale" | "prezzo_fisso";
  sconto_pct: number | null;
  prezzo_kg: number | null;
  giustificazione: string;
  versione: number;
};

function mapRow(row: Row): AccordoPrezzoProdotto {
  return {
    id: String(row.id),
    prodottoCodice: String(row.prodotto_codice),
    modalita: row.modalita,
    scontoPct: row.sconto_pct == null ? null : Number(row.sconto_pct),
    prezzoKg: row.prezzo_kg == null ? null : Number(row.prezzo_kg),
    giustificazione: String(row.giustificazione ?? ""),
    versione: Number(row.versione ?? 1),
  };
}

async function guard() {
  return requireAnyAreaAccess(["amministrazione", "commerciale"]);
}

export async function listAccordiPrezzoAziendaAction(input: {
  aziendaTipo: AccordoPrezzoAziendaTipo;
  aziendaId: string;
}): Promise<
  | { success: true; items: AccordoPrezzoProdotto[] }
  | { success: false; error: string }
> {
  await guard();
  const parsed = lookupAccordoPrezzoSchema
    .pick({ aziendaTipo: true, aziendaId: true })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: "Azienda non valida." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accordi_prezzo_prodotto")
    .select(
      "id, prodotto_codice, modalita, sconto_pct, prezzo_kg, giustificazione, versione"
    )
    .eq("azienda_tipo", parsed.data.aziendaTipo)
    .eq("azienda_id", parsed.data.aziendaId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Row[]).map(mapRow),
  };
}

export async function getAccordoPrezzoProdottoAction(input: {
  aziendaTipo: AccordoPrezzoAziendaTipo;
  aziendaId: string;
  prodottoCodice: string;
}): Promise<
  | { success: true; item: AccordoPrezzoProdotto | null }
  | { success: false; error: string }
> {
  await guard();
  const parsed = lookupAccordoPrezzoSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accordi_prezzo_prodotto")
    .select(
      "id, prodotto_codice, modalita, sconto_pct, prezzo_kg, giustificazione, versione"
    )
    .eq("azienda_tipo", parsed.data.aziendaTipo)
    .eq("azienda_id", parsed.data.aziendaId)
    .eq("prodotto_codice", parsed.data.prodottoCodice)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, item: data ? mapRow(data as Row) : null };
}

export async function saveAccordiPrezzoAziendaAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const parsed = saveAccordiPrezzoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const { aziendaTipo, aziendaId, voci } = parsed.data;
  const supabase = await createClient();
  const { data: existing, error: loadErr } = await supabase
    .from("accordi_prezzo_prodotto")
    .select("id, prodotto_codice, versione")
    .eq("azienda_tipo", aziendaTipo)
    .eq("azienda_id", aziendaId)
    .is("deleted_at", null);
  if (loadErr) return { success: false, error: loadErr.message };
  const open = new Map(
    (existing ?? []).map((row) => [String(row.prodotto_codice), row])
  );
  const tenuti = new Set<string>();
  const now = new Date().toISOString();

  for (const voce of voci) {
    if (voce.modalita === "nessuno") continue;
    tenuti.add(voce.prodottoCodice);
    const payload = {
      modalita: voce.modalita,
      sconto_pct:
        voce.modalita === "sconto_percentuale" ? voce.scontoPct ?? null : null,
      prezzo_kg: voce.modalita === "prezzo_fisso" ? voce.prezzoKg ?? null : null,
      giustificazione: voce.giustificazione.trim(),
      stato: "concordato" as const,
      updated_by: auth.userId,
    };
    const current = open.get(voce.prodottoCodice);
    if (current) {
      const versione = Number(current.versione ?? 1) + 1;
      const { error } = await supabase
        .from("accordi_prezzo_prodotto")
        .update({ ...payload, versione })
        .eq("id", current.id)
        .is("deleted_at", null);
      if (error) return { success: false, error: error.message };
      await writeAuditLog({
        entity_type: "accordi_prezzo_prodotto",
        entity_id: String(current.id),
        action: "update",
        actor_id: auth.userId,
        summary: `Accordo prezzo ${voce.prodottoCodice} aggiornato (v${versione})`,
        payload: { ...payload, versione, aziendaTipo, aziendaId },
      });
      continue;
    }
    const { data: inserted, error } = await supabase
      .from("accordi_prezzo_prodotto")
      .insert({
        azienda_tipo: aziendaTipo,
        azienda_id: aziendaId,
        prodotto_codice: voce.prodottoCodice,
        ...payload,
        versione: 1,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return { success: false, error: error?.message ?? "Salvataggio accordo fallito." };
    }
    await writeAuditLog({
      entity_type: "accordi_prezzo_prodotto",
      entity_id: String(inserted.id),
      action: "create",
      actor_id: auth.userId,
      summary: `Accordo prezzo ${voce.prodottoCodice} concordato`,
      payload: { ...payload, aziendaTipo, aziendaId },
    });
  }

  for (const [codice, row] of open) {
    if (tenuti.has(codice)) continue;
    const { error } = await supabase
      .from("accordi_prezzo_prodotto")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", row.id)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await writeAuditLog({
      entity_type: "accordi_prezzo_prodotto",
      entity_id: String(row.id),
      action: "update",
      actor_id: auth.userId,
      summary: `Accordo prezzo ${codice} chiuso`,
      payload: { aziendaTipo, aziendaId, prodottoCodice: codice },
    });
  }

  return { success: true };
}

export async function copiaAccordiPrezzoAzienda(input: {
  fromTipo: AccordoPrezzoAziendaTipo;
  fromId: string;
  toTipo: AccordoPrezzoAziendaTipo;
  toId: string;
  actorId: string;
}): Promise<void> {
  const supabase = await createClient();
  const { data: source } = await supabase
    .from("accordi_prezzo_prodotto")
    .select(
      "prodotto_codice, modalita, sconto_pct, prezzo_kg, giustificazione"
    )
    .eq("azienda_tipo", input.fromTipo)
    .eq("azienda_id", input.fromId)
    .is("deleted_at", null);
  if (!source?.length) return;
  const { data: dest } = await supabase
    .from("accordi_prezzo_prodotto")
    .select("prodotto_codice")
    .eq("azienda_tipo", input.toTipo)
    .eq("azienda_id", input.toId)
    .is("deleted_at", null);
  const have = new Set((dest ?? []).map((row) => String(row.prodotto_codice)));
  const missing = (source as Row[]).filter(
    (row) => !have.has(String(row.prodotto_codice))
  );
  if (!missing.length) return;
  const { data: inserted, error } = await supabase
    .from("accordi_prezzo_prodotto")
    .insert(
      missing.map((row) => ({
        azienda_tipo: input.toTipo,
        azienda_id: input.toId,
        prodotto_codice: row.prodotto_codice,
        modalita: row.modalita,
        sconto_pct: row.sconto_pct,
        prezzo_kg: row.prezzo_kg,
        giustificazione: row.giustificazione,
        versione: 1,
        stato: "concordato",
        created_by: input.actorId,
        updated_by: input.actorId,
      }))
    )
    .select("id, prodotto_codice");
  if (error) {
    console.error("[accordi_prezzo copia]", error.message);
    return;
  }
  for (const row of inserted ?? []) {
    const src = missing.find(
      (item) => String(item.prodotto_codice) === String(row.prodotto_codice)
    );
    await writeAuditLog({
      entity_type: "accordi_prezzo_prodotto",
      entity_id: String(row.id),
      action: "create",
      actor_id: input.actorId,
      summary: `Accordo prezzo ${row.prodotto_codice} copiato dal possibile cliente`,
      payload: {
        fromId: input.fromId,
        toId: input.toId,
        valore: src ? valoreOrigineAccordo(mapRow({ ...src, id: "", versione: 1 })) : null,
      },
    });
  }
}
