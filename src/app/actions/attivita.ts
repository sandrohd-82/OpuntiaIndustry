"use server";

import { createClient } from "@/lib/supabase/server";
import {
  attivitaInputSchema,
  isValidCodiceAttivita,
  mapAttivitaRow,
  normalizeAttivitaInput,
  type Attivita,
  type AttivitaInput,
  type AttivitaLinked,
  type AttivitaProdottoLinkInput,
  type ProdottoLinkedAdAttivita,
} from "@/lib/amministrazione/attivita";
import { writeAuditLog } from "@/lib/audit";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { requireAreaAccess } from "@/lib/areas/guard";
import type {
  AttivitaInsert,
  AttivitaRow,
  ProdottoProprioAttivitaRow,
  ProdottoProprioRow,
} from "@/types/database";

export type AttivitaActionResult =
  | { success: true; attivita: Attivita }
  | { success: false; error: string };

export async function listAttivitaAction(): Promise<
  | { success: true; attivita: Attivita[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attivita")
    .select("*")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    attivita: ((data ?? []) as AttivitaRow[]).map(mapAttivitaRow),
  };
}

export async function listAttivitaByProdottoAction(
  prodottoId: string
): Promise<
  | { success: true; attivita: AttivitaLinked[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!prodottoId) return { success: true, attivita: [] };
  const supabase = await createClient();
  const { data: links, error: linkErr } = await supabase
    .from("prodotti_propri_attivita")
    .select("attivita_id, sort_order, obbligatoria")
    .eq("prodotto_id", prodottoId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (linkErr) return { success: false, error: linkErr.message };
  const linkRows = (links ?? []) as Array<{
    attivita_id: string;
    sort_order: number;
    obbligatoria?: boolean | null;
  }>;
  const ids = linkRows.map((r) => r.attivita_id);
  if (!ids.length) return { success: true, attivita: [] };

  const { data, error } = await supabase
    .from("attivita")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const byId = new Map(
    ((data ?? []) as AttivitaRow[]).map((r) => [r.id, mapAttivitaRow(r)])
  );
  const ordered: AttivitaLinked[] = [];
  for (const link of linkRows) {
    const a = byId.get(link.attivita_id);
    if (!a) continue;
    ordered.push({
      ...a,
      obbligatoria: link.obbligatoria !== false,
      sortOrder: link.sort_order,
    });
  }
  return { success: true, attivita: ordered };
}

export async function listProdottiByAttivitaAction(
  attivitaId: string
): Promise<
  | { success: true; prodotti: ProdottoLinkedAdAttivita[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!attivitaId) return { success: true, prodotti: [] };
  const supabase = await createClient();
  const { data: links, error: linkErr } = await supabase
    .from("prodotti_propri_attivita")
    .select("prodotto_id, obbligatoria")
    .eq("attivita_id", attivitaId)
    .is("deleted_at", null);
  if (linkErr) return { success: false, error: linkErr.message };
  const linkRows = (links ?? []) as Array<{
    prodotto_id: string;
    obbligatoria?: boolean | null;
  }>;
  if (!linkRows.length) return { success: true, prodotti: [] };

  const ids = linkRows.map((r) => r.prodotto_id);
  const { data, error } = await supabase
    .from("prodotti_propri")
    .select("id, codice, nome, is_bio")
    .in("id", ids)
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };

  const obblById = new Map(
    linkRows.map((r) => [r.prodotto_id, r.obbligatoria !== false])
  );
  const prodotti: ProdottoLinkedAdAttivita[] = (
    (data ?? []) as Array<
      Pick<ProdottoProprioRow, "id" | "codice" | "nome" | "is_bio">
    >
  ).map((p) => ({
    prodottoId: p.id,
    codice: p.codice,
    nome: p.nome,
    isBio: Boolean(p.is_bio),
    obbligatoria: obblById.get(p.id) ?? true,
  }));
  return { success: true, prodotti };
}

export async function setProdottiPropriAttivitaAction(input: {
  prodottoId: string;
  /** Preferito: id + flag obbligatoria. */
  links?: Array<{ attivitaId: string; obbligatoria?: boolean }>;
  /** @deprecated */
  attivitaIds?: string[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const links: Array<{ attivitaId: string; obbligatoria: boolean }> =
    input.links?.map((l) => ({
      attivitaId: l.attivitaId,
      obbligatoria: l.obbligatoria !== false,
    })) ??
    (input.attivitaIds ?? []).map((id) => ({
      attivitaId: id,
      obbligatoria: true,
    }));

  const { data: existing, error: exErr } = await supabase
    .from("prodotti_propri_attivita")
    .select("id, attivita_id")
    .eq("prodotto_id", input.prodottoId)
    .is("deleted_at", null);
  if (exErr) return { success: false, error: exErr.message };

  const wanted = links.filter((l) => l.attivitaId);
  const current = (existing ?? []) as Array<{
    id: string;
    attivita_id: string;
  }>;
  const currentIds = new Set(current.map((c) => c.attivita_id));

  const toRemove = current.filter(
    (c) => !wanted.some((w) => w.attivitaId === c.attivita_id)
  );
  if (toRemove.length) {
    await supabase
      .from("prodotti_propri_attivita")
      .update({
        deleted_at: nowIso,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .in(
        "id",
        toRemove.map((r) => r.id)
      );
  }

  for (let i = 0; i < wanted.length; i += 1) {
    const link = wanted[i]!;
    if (currentIds.has(link.attivitaId)) {
      await supabase
        .from("prodotti_propri_attivita")
        .update({
          sort_order: i,
          obbligatoria: link.obbligatoria,
          updated_by: auth.userId,
        })
        .eq("prodotto_id", input.prodottoId)
        .eq("attivita_id", link.attivitaId)
        .is("deleted_at", null);
    } else {
      const { error: insErr } = await supabase
        .from("prodotti_propri_attivita")
        .insert({
          prodotto_id: input.prodottoId,
          attivita_id: link.attivitaId,
          sort_order: i,
          obbligatoria: link.obbligatoria,
          created_by: auth.userId,
          updated_by: auth.userId,
        });
      if (insErr) return { success: false, error: insErr.message };
    }
  }

  await writeAuditLog({
    entity_type: "prodotti_propri_attivita",
    entity_id: input.prodottoId,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornate attività prodotto (${wanted.length})`,
    payload: { links: wanted },
  });

  return { success: true };
}

export async function setAttivitaProdottiAction(input: {
  attivitaId: string;
  links: AttivitaProdottoLinkInput[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const wanted = input.links.filter((l) => l.prodottoId);

  const { data: existing, error: exErr } = await supabase
    .from("prodotti_propri_attivita")
    .select("id, prodotto_id, sort_order")
    .eq("attivita_id", input.attivitaId)
    .is("deleted_at", null);
  if (exErr) return { success: false, error: exErr.message };

  const current = (existing ?? []) as Array<{
    id: string;
    prodotto_id: string;
    sort_order: number;
  }>;
  const currentByProdotto = new Map(
    current.map((c) => [c.prodotto_id, c] as const)
  );

  const toRemove = current.filter(
    (c) => !wanted.some((w) => w.prodottoId === c.prodotto_id)
  );
  if (toRemove.length) {
    await supabase
      .from("prodotti_propri_attivita")
      .update({
        deleted_at: nowIso,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .in(
        "id",
        toRemove.map((r) => r.id)
      );
  }

  for (const link of wanted) {
    const existingLink = currentByProdotto.get(link.prodottoId);
    if (existingLink) {
      await supabase
        .from("prodotti_propri_attivita")
        .update({
          obbligatoria: link.obbligatoria,
          updated_by: auth.userId,
        })
        .eq("id", existingLink.id);
      continue;
    }

    const { data: maxRow } = await supabase
      .from("prodotti_propri_attivita")
      .select("sort_order")
      .eq("prodotto_id", link.prodottoId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder =
      Number(
        (maxRow as { sort_order?: number } | null)?.sort_order ?? -1
      ) + 1;

    const { error: insErr } = await supabase
      .from("prodotti_propri_attivita")
      .insert({
        prodotto_id: link.prodottoId,
        attivita_id: input.attivitaId,
        sort_order: nextOrder,
        obbligatoria: link.obbligatoria,
        created_by: auth.userId,
        updated_by: auth.userId,
      } satisfies Partial<ProdottoProprioAttivitaRow>);
    if (insErr) return { success: false, error: insErr.message };
  }

  await writeAuditLog({
    entity_type: "prodotti_propri_attivita",
    entity_id: input.attivitaId,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornati prodotti attività (${wanted.length})`,
    payload: { links: wanted },
  });

  return { success: true };
}

export async function createAttivitaAction(
  input: AttivitaInput
): Promise<AttivitaActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = attivitaInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const normalized = normalizeAttivitaInput(parsed.data);
  if (!isValidCodiceAttivita(normalized.codice)) {
    return {
      success: false,
      error:
        "La targa deve iniziare con At, seguito da lettere, cifre o - _ / (es. At-TRi/DRa).",
    };
  }

  const supabase = await createClient();
  const insert: AttivitaInsert = {
    codice: normalized.codice,
    titolo: normalized.titolo,
    spiegazione: normalized.spiegazione ?? "",
    kg_per_ora: normalized.kgPerOra,
    ore_giorno: normalized.oreGiorno ?? 8,
    incastrabile_durante_lavorazione: Boolean(
      normalized.incastrabileDuranteLavorazione
    ),
    documento_stato: normalized.documentoStato ?? "approvato",
    versione: 1,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data, error } = await supabase
    .from("attivita")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error:
        error?.code === "23505"
          ? `La targa ${normalized.codice} esiste già.`
          : error?.message ?? "Salvataggio non riuscito.",
    };
  }

  const row = data as AttivitaRow;
  await writeAuditLog({
    entity_type: "attivita",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata attività ${row.codice}`,
    payload: { codice: row.codice, titolo: row.titolo },
  });

  if (input.prodottiLinks?.length) {
    const linked = await setAttivitaProdottiAction({
      attivitaId: row.id,
      links: input.prodottiLinks,
    });
    if (!linked.success) {
      return { success: false, error: linked.error };
    }
  }

  return { success: true, attivita: mapAttivitaRow(row) };
}

export async function updateAttivitaAction(
  id: string,
  input: AttivitaInput
): Promise<AttivitaActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = attivitaInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const normalized = normalizeAttivitaInput(parsed.data);
  if (!isValidCodiceAttivita(normalized.codice)) {
    return {
      success: false,
      error:
        "La targa deve iniziare con At, seguito da lettere, cifre o - _ /.",
    };
  }

  const supabase = await createClient();
  const { data: prev } = await supabase
    .from("attivita")
    .select("versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data, error } = await supabase
    .from("attivita")
    .update({
      codice: normalized.codice,
      titolo: normalized.titolo,
      spiegazione: normalized.spiegazione ?? "",
      kg_per_ora: normalized.kgPerOra,
      ore_giorno: normalized.oreGiorno ?? 8,
      incastrabile_durante_lavorazione: Boolean(
        normalized.incastrabileDuranteLavorazione
      ),
      documento_stato: normalized.documentoStato ?? "approvato",
      versione: Number((prev as { versione?: number } | null)?.versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error:
        error?.code === "23505"
          ? `La targa ${normalized.codice} esiste già.`
          : error?.message ?? "Aggiornamento non riuscito.",
    };
  }

  const row = data as AttivitaRow;
  await writeAuditLog({
    entity_type: "attivita",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata attività ${row.codice}`,
    payload: { codice: row.codice, titolo: row.titolo },
  });

  if (input.prodottiLinks !== undefined) {
    const linked = await setAttivitaProdottiAction({
      attivitaId: id,
      links: input.prodottiLinks,
    });
    if (!linked.success) {
      return { success: false, error: linked.error };
    }
  }

  return { success: true, attivita: mapAttivitaRow(row) };
}

export async function softDeleteAttivitaAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data: row, error: loadErr } = await supabase
    .from("attivita")
    .select("id, codice")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!row) return { success: false, error: "Attività non trovata." };

  const expected = fraseConfermaSoftDelete(
    (row as { codice: string }).codice
  );
  if (input.confermaTestuale.trim() !== expected) {
    return {
      success: false,
      error: `Per confermare digita esattamente: ${expected}`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("attivita")
    .update({
      deleted_at: nowIso,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "attivita",
    entity_id: input.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Eliminata (soft) attività ${(row as { codice: string }).codice}`,
    payload: { codice: (row as { codice: string }).codice },
  });

  return { success: true };
}
