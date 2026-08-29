"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  createListinoSchema,
  mapListino,
  mapListinoRiga,
  upsertListinoRigaSchema,
  type Listino,
  type ListinoRiga,
} from "@/lib/ecosystem/listini";
import { createClient } from "@/lib/supabase/server";
import type {
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

  return {
    success: true,
    items: rows.map((r) => mapListinoRiga(r, prodotti.get(r.prodotto_id))),
  };
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
    payload: { prezzo: parsed.data.prezzo },
  });

  return { success: true, item: mapListinoRiga(row) };
}

export async function softDeleteListinoRigaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  const supabase = await createClient();
  const { error } = await supabase
    .from("listini_righe")
    .update({
      deleted_at: new Date().toISOString(),
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
