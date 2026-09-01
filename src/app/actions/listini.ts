"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  createListinoSchema,
  listinoCondizioniSovrapposte,
  mapListino,
  mapListinoRiga,
  mapListinoRigaCondizione,
  updateListinoSchema,
  upsertListinoRigaCondizioneSchema,
  upsertListinoRigaSchema,
  type Listino,
  type ListinoRiga,
  type ListinoRigaCondizione,
} from "@/lib/ecosystem/listini";
import { createClient } from "@/lib/supabase/server";
import type {
  ListinoRigaCondizioneRow,
  ListinoRigaRow,
  ListinoRow,
  ListinoStato,
  ProdottoProprioRow,
  StatoPubblicazioneCanale,
} from "@/types/database";

async function guardAmm() {
  return requireAreaAccess("amministrazione");
}

export async function listListiniAction(): Promise<
  { success: true; items: Listino[] } | { success: false; error: string }
> {
  await guardAmm();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listini")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as ListinoRow[]).map(mapListino),
  };
}

export async function createListinoAction(input: unknown): Promise<
  { success: true; item: Listino } | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const parsed = createListinoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listini")
    .insert({
      codice: parsed.data.codice,
      nome: parsed.data.nome,
      canale: "b2b",
      valido_dal: parsed.data.validoDal,
      valido_al: parsed.data.validoAl || null,
      note: parsed.data.note,
      stato: "bozza",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Inserimento fallito" };
  }

  const row = data as ListinoRow;
  await writeAuditLog({
    entity_type: "listini",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato listino B2B ${row.codice} (bozza v1)`,
  });
  return { success: true, item: mapListino(row) };
}

async function requireListinoBozza(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listinoId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("listini")
    .select("id, stato")
    .eq("id", listinoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Listino non trovato" };
  }
  if ((data as { stato: string }).stato !== "bozza") {
    return {
      ok: false,
      error:
        "Solo una bozza è modificabile. Riporta il listino in Bozza oppure creane uno nuovo.",
    };
  }
  return { ok: true };
}

export async function updateListinoAction(input: unknown): Promise<
  { success: true; item: Listino } | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const parsed = updateListinoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const gate = await requireListinoBozza(supabase, parsed.data.id);
  if (!gate.ok) return { success: false, error: gate.error };

  const { data, error } = await supabase
    .from("listini")
    .update({
      codice: parsed.data.codice,
      nome: parsed.data.nome,
      valido_dal: parsed.data.validoDal,
      valido_al: parsed.data.validoAl || null,
      note: parsed.data.note,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito" };
  }
  const row = data as ListinoRow;
  await writeAuditLog({
    entity_type: "listini",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata testata listino ${row.codice} (bozza)`,
    payload: {
      codice: row.codice,
      nome: row.nome,
      valido_dal: row.valido_dal,
      valido_al: row.valido_al,
    },
  });
  return { success: true, item: mapListino(row) };
}

export async function setListinoStatoAction(input: {
  id: string;
  stato: ListinoStato;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  if (!["bozza", "approvato", "pubblicato", "chiuso"].includes(input.stato)) {
    return { success: false, error: "Stato non valido" };
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("listini")
    .select("id, stato, versione, codice")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError || !current) {
    return { success: false, error: readError?.message ?? "Listino non trovato" };
  }

  const patch: Record<string, unknown> = {
    stato: input.stato,
    updated_by: auth.userId,
    versione: Number(current.versione ?? 1) + 1,
  };
  if (input.stato === "approvato") {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = auth.userId;
  }
  if (input.stato === "pubblicato") {
    patch.published_at = new Date().toISOString();
    patch.published_by = auth.userId;
    patch.approved_at = new Date().toISOString();
    patch.approved_by = auth.userId;
  }

  const { error } = await supabase.from("listini").update(patch).eq("id", input.id);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "listini",
    entity_id: input.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Listino ${current.codice}: ${current.stato} → ${input.stato}`,
    payload: { from: current.stato, to: input.stato },
  });
  return { success: true };
}

export async function listListinoRigheAction(
  listinoId: string
): Promise<
  { success: true; items: ListinoRiga[] } | { success: false; error: string }
> {
  await guardAmm();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listini_righe")
    .select("*")
    .eq("listino_id", listinoId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as ListinoRigaRow[];
  const prodottoIds = [...new Set(rows.map((r) => r.prodotto_id))];
  const prodotti = new Map<string, { codice: string; nome: string }>();
  if (prodottoIds.length) {
    const { data: ps } = await supabase
      .from("prodotti_propri")
      .select("id, codice, nome")
      .in("id", prodottoIds);
    for (const p of ps ?? []) {
      const row = p as { id: string; codice: string; nome: string };
      prodotti.set(row.id, { codice: row.codice, nome: row.nome });
    }
  }

  const condizioniByRiga = await loadCondizioniByRiga(
    supabase,
    rows.map((r) => r.id)
  );

  return {
    success: true,
    items: rows.map((r) =>
      mapListinoRiga(
        r,
        prodotti.get(r.prodotto_id),
        condizioniByRiga.get(r.id) ?? []
      )
    ),
  };
}

async function loadCondizioniByRiga(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rigaIds: string[]
): Promise<Map<string, ListinoRigaCondizione[]>> {
  const map = new Map<string, ListinoRigaCondizione[]>();
  if (!rigaIds.length) return map;
  const { data } = await supabase
    .from("listini_righe_condizioni")
    .select("*")
    .in("listino_riga_id", rigaIds)
    .is("deleted_at", null)
    .order("qty_da", { ascending: true });
  const rows = (data ?? []) as ListinoRigaCondizioneRow[];
  const imbIds = [...new Set(rows.map((r) => r.imballaggio_voce_id))];
  const imballaggi = new Map<string, { codice: string; nome: string }>();
  if (imbIds.length) {
    const { data: vs } = await supabase
      .from("imballaggi_voci")
      .select("id, codice, nome")
      .in("id", imbIds);
    for (const v of vs ?? []) {
      const row = v as { id: string; codice: string; nome: string };
      imballaggi.set(row.id, { codice: row.codice, nome: row.nome });
    }
  }
  for (const r of rows) {
    const list = map.get(r.listino_riga_id) ?? [];
    list.push(mapListinoRigaCondizione(r, imballaggi.get(r.imballaggio_voce_id)));
    map.set(r.listino_riga_id, list);
  }
  return map;
}

export async function upsertListinoRigaAction(input: unknown): Promise<
  { success: true; item: ListinoRiga } | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const parsed = upsertListinoRigaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }

  const supabase = await createClient();
  const gate = await requireListinoBozza(supabase, parsed.data.listinoId);
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: existing } = await supabase
    .from("listini_righe")
    .select("id")
    .eq("listino_id", parsed.data.listinoId)
    .eq("prodotto_id", parsed.data.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();

  let row: ListinoRigaRow | null = null;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("listini_righe")
      .update({
        prezzo: parsed.data.prezzo,
        unita_misura: parsed.data.unitaMisura,
        iva_percentuale: parsed.data.ivaPercentuale,
        min_qty: parsed.data.minQty,
        sconto_max_pct: parsed.data.scontoMaxPct,
        updated_by: auth.userId,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Aggiornamento fallito" };
    }
    row = data as ListinoRigaRow;
  } else {
    const { data, error } = await supabase
      .from("listini_righe")
      .insert({
        listino_id: parsed.data.listinoId,
        prodotto_id: parsed.data.prodottoId,
        prezzo: parsed.data.prezzo,
        unita_misura: parsed.data.unitaMisura,
        iva_percentuale: parsed.data.ivaPercentuale,
        min_qty: parsed.data.minQty,
        sconto_max_pct: parsed.data.scontoMaxPct,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("*")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Inserimento fallito" };
    }
    row = data as ListinoRigaRow;
  }

  await writeAuditLog({
    entity_type: "listini_righe",
    entity_id: row.id,
    action: existing?.id ? "update" : "create",
    actor_id: auth.userId,
    summary: `Riga listino prodotto ${parsed.data.prodottoId}`,
    payload: {
      prezzo: parsed.data.prezzo,
      unita_misura: parsed.data.unitaMisura,
    },
  });

  const condizioni = (await loadCondizioniByRiga(supabase, [row.id])).get(row.id);
  return { success: true, item: mapListinoRiga(row, undefined, condizioni) };
}

export async function softDeleteListinoRigaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  const supabase = await createClient();
  const { data: riga } = await supabase
    .from("listini_righe")
    .select("listino_id")
    .eq("id", id)
    .maybeSingle();
  if (!riga) return { success: false, error: "Riga non trovata" };
  const gate = await requireListinoBozza(
    supabase,
    (riga as { listino_id: string }).listino_id
  );
  if (!gate.ok) return { success: false, error: gate.error };

  const now = new Date().toISOString();
  const { error: condErr } = await supabase
    .from("listini_righe_condizioni")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("listino_riga_id", id)
    .is("deleted_at", null);
  if (condErr) return { success: false, error: condErr.message };

  const { error } = await supabase
    .from("listini_righe")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "listini_righe",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Rimossa riga listino (soft delete)",
  });
  return { success: true };
}

export async function upsertListinoRigaCondizioneAction(input: unknown): Promise<
  | { success: true; item: ListinoRigaCondizione }
  | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const parsed = upsertListinoRigaCondizioneSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }

  const supabase = await createClient();
  const { data: riga, error: rigaErr } = await supabase
    .from("listini_righe")
    .select("id, listino_id")
    .eq("id", parsed.data.listinoRigaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (rigaErr || !riga) {
    return { success: false, error: rigaErr?.message ?? "Riga listino non trovata" };
  }
  const gate = await requireListinoBozza(
    supabase,
    (riga as { listino_id: string }).listino_id
  );
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: existingRows } = await supabase
    .from("listini_righe_condizioni")
    .select("*")
    .eq("listino_riga_id", parsed.data.listinoRigaId)
    .eq("imballaggio_voce_id", parsed.data.imballaggioVoceId)
    .is("deleted_at", null);
  const esistenti = ((existingRows ?? []) as ListinoRigaCondizioneRow[]).map(
    (r) => ({
      id: r.id,
      qtyDa: Number(r.qty_da),
      qtyA: r.qty_a == null ? null : Number(r.qty_a),
    })
  );
  if (
    listinoCondizioniSovrapposte(esistenti, {
      id: parsed.data.id,
      qtyDa: parsed.data.qtyDa,
      qtyA: parsed.data.qtyA ?? null,
    })
  ) {
    return {
      success: false,
      error:
        "Lo scaglione si sovrappone a un’altra condizione per la stessa confezione.",
    };
  }

  let row: ListinoRigaCondizioneRow | null = null;
  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("listini_righe_condizioni")
      .update({
        qty_da: parsed.data.qtyDa,
        qty_a: parsed.data.qtyA ?? null,
        imballaggio_voce_id: parsed.data.imballaggioVoceId,
        sconto_pct: parsed.data.scontoPct,
        updated_by: auth.userId,
      })
      .eq("id", parsed.data.id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Aggiornamento fallito" };
    }
    row = data as ListinoRigaCondizioneRow;
  } else {
    const { data, error } = await supabase
      .from("listini_righe_condizioni")
      .insert({
        listino_riga_id: parsed.data.listinoRigaId,
        qty_da: parsed.data.qtyDa,
        qty_a: parsed.data.qtyA ?? null,
        imballaggio_voce_id: parsed.data.imballaggioVoceId,
        sconto_pct: parsed.data.scontoPct,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("*")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Inserimento fallito" };
    }
    row = data as ListinoRigaCondizioneRow;
  }

  await writeAuditLog({
    entity_type: "listini_righe_condizioni",
    entity_id: row.id,
    action: parsed.data.id ? "update" : "create",
    actor_id: auth.userId,
    summary: `Condizione sconto listino ${parsed.data.scontoPct}%`,
    payload: {
      qty_da: parsed.data.qtyDa,
      qty_a: parsed.data.qtyA ?? null,
      imballaggio_voce_id: parsed.data.imballaggioVoceId,
      sconto_pct: parsed.data.scontoPct,
    },
  });

  const { data: imb } = await supabase
    .from("imballaggi_voci")
    .select("codice, nome")
    .eq("id", row.imballaggio_voce_id)
    .maybeSingle();
  return {
    success: true,
    item: mapListinoRigaCondizione(
      row,
      imb
        ? { codice: (imb as { codice: string; nome: string }).codice, nome: (imb as { codice: string; nome: string }).nome }
        : undefined
    ),
  };
}

export async function softDeleteListinoRigaCondizioneAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  const supabase = await createClient();
  const { data: cond } = await supabase
    .from("listini_righe_condizioni")
    .select("listino_riga_id")
    .eq("id", id)
    .maybeSingle();
  if (!cond) return { success: false, error: "Condizione non trovata" };
  const { data: riga } = await supabase
    .from("listini_righe")
    .select("listino_id")
    .eq("id", (cond as { listino_riga_id: string }).listino_riga_id)
    .maybeSingle();
  if (!riga) return { success: false, error: "Riga listino non trovata" };
  const gate = await requireListinoBozza(
    supabase,
    (riga as { listino_id: string }).listino_id
  );
  if (!gate.ok) return { success: false, error: gate.error };

  const { error } = await supabase
    .from("listini_righe_condizioni")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "listini_righe_condizioni",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Rimossa condizione sconto listino (soft delete)",
  });
  return { success: true };
}

export type ProdottoCanale = {
  id: string;
  codice: string;
  nome: string;
  slugPubblico: string;
  nomePubblico: string;
  descrizionePubblica: string;
  unitaMisura: string;
  visibileB2b: boolean;
  visibileB2c: boolean;
  visibileWiki: boolean;
  statoPubblicazione: StatoPubblicazioneCanale;
};

export async function listProdottiCanaliAction(): Promise<
  { success: true; items: ProdottoCanale[] } | { success: false; error: string }
> {
  await guardAmm();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prodotti_propri")
    .select(
      "id, codice, nome, slug_pubblico, nome_pubblico, descrizione_pubblica, unita_misura, visibile_b2b, visibile_b2c, visibile_wiki, stato_pubblicazione"
    )
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };

  return {
    success: true,
    items: ((data ?? []) as ProdottoProprioRow[]).map((r) => ({
      id: r.id,
      codice: r.codice,
      nome: r.nome,
      slugPubblico: r.slug_pubblico ?? "",
      nomePubblico: r.nome_pubblico ?? "",
      descrizionePubblica: r.descrizione_pubblica ?? "",
      unitaMisura: r.unita_misura ?? "kg",
      visibileB2b: Boolean(r.visibile_b2b),
      visibileB2c: Boolean(r.visibile_b2c),
      visibileWiki: Boolean(r.visibile_wiki),
      statoPubblicazione: r.stato_pubblicazione ?? "bozza",
    })),
  };
}

export async function updateProdottoCanaleAction(input: {
  id: string;
  slugPubblico: string;
  nomePubblico: string;
  descrizionePubblica: string;
  unitaMisura: string;
  visibileB2b: boolean;
  visibileB2c: boolean;
  visibileWiki: boolean;
  statoPubblicazione: StatoPubblicazioneCanale;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  const stati: StatoPubblicazioneCanale[] = [
    "bozza",
    "approvato",
    "pubblicato",
    "ritirato",
  ];
  if (!stati.includes(input.statoPubblicazione)) {
    return { success: false, error: "Stato pubblicazione non valido" };
  }

  const slug = input.slugPubblico.trim().toLowerCase();
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { success: false, error: "Slug: solo minuscole, numeri e -" };
  }
  if (input.statoPubblicazione === "pubblicato" && !slug) {
    return { success: false, error: "Per pubblicare serve uno slug URL" };
  }

  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    slug_pubblico: slug || null,
    nome_pubblico: input.nomePubblico.trim(),
    descrizione_pubblica: input.descrizionePubblica.trim(),
    unita_misura: input.unitaMisura.trim() || "kg",
    visibile_b2b: input.visibileB2b,
    visibile_b2c: input.visibileB2c,
    visibile_wiki: input.visibileWiki,
    stato_pubblicazione: input.statoPubblicazione,
    updated_by: auth.userId,
  };
  if (input.statoPubblicazione === "pubblicato") {
    patch.published_at = new Date().toISOString();
    patch.published_by = auth.userId;
  }

  const { error } = await supabase
    .from("prodotti_propri")
    .update(patch)
    .eq("id", input.id);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "prodotti_propri",
    entity_id: input.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Pubblicazione canali prodotto → ${input.statoPubblicazione}`,
    payload: {
      slug,
      visibile_b2b: input.visibileB2b,
      visibile_wiki: input.visibileWiki,
    },
  });
  return { success: true };
}
