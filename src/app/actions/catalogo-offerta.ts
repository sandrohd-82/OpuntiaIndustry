"use server";

import {
  isValidCatalogoCodice,
  mapCatalogoProdottoFornitore,
  mapCatalogoServizio,
  normalizeCatalogoInput,
  normalizeNomeCatalogo,
  type CatalogoOffertaInput,
  type CatalogoOffertaItem,
  type CatalogoOffertaKind,
} from "@/lib/amministrazione/catalogo-offerta";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { createClient } from "@/lib/supabase/server";
import type {
  CatalogoProdottoFornitoreRow,
  CatalogoServizioRow,
} from "@/types/database";

function tableName(kind: CatalogoOffertaKind) {
  return kind === "servizio"
    ? "catalogo_servizi"
    : "catalogo_prodotti_fornitore";
}

function entityType(kind: CatalogoOffertaKind) {
  return tableName(kind);
}

function mapRow(
  kind: CatalogoOffertaKind,
  row: CatalogoServizioRow | CatalogoProdottoFornitoreRow
): CatalogoOffertaItem {
  return kind === "servizio"
    ? mapCatalogoServizio(row as CatalogoServizioRow)
    : mapCatalogoProdottoFornitore(row as CatalogoProdottoFornitoreRow);
}

async function assertCodiceAndNomeUnici(
  kind: CatalogoOffertaKind,
  supabase: Awaited<ReturnType<typeof createClient>>,
  codice: string,
  nome: string,
  excludeId?: string
): Promise<string | null> {
  const table = tableName(kind);
  const { data: rows, error } = await supabase
    .from(table)
    .select("id, nome, codice")
    .is("deleted_at", null);
  if (error) return error.message;

  const list = (rows ?? []) as Array<{
    id: string;
    nome: string;
    codice: string;
  }>;
  const codiceLower = codice.toLowerCase();
  const byCodice = list.find(
    (row) =>
      row.codice.toLowerCase() === codiceLower &&
      (!excludeId || row.id !== excludeId)
  );
  if (byCodice) {
    return `Il codice ${codice} esiste già. La targa deve essere univoca.`;
  }

  const nomeNorm = normalizeNomeCatalogo(nome);
  const duplicateNome = list
    .filter((row) => !excludeId || row.id !== excludeId)
    .find((row) => normalizeNomeCatalogo(row.nome) === nomeNorm);

  if (duplicateNome) {
    return `Esiste già una voce con lo stesso nome (${duplicateNome.codice} — ${duplicateNome.nome}).`;
  }
  return null;
}

export async function listCatalogoServiziAction(): Promise<
  | { success: true; items: CatalogoOffertaItem[] }
  | { success: false; error: string }
> {
  return listCatalogoAction("servizio");
}

export async function listCatalogoProdottiFornitoreAction(): Promise<
  | { success: true; items: CatalogoOffertaItem[] }
  | { success: false; error: string }
> {
  return listCatalogoAction("prodotto");
}

async function listCatalogoAction(
  kind: CatalogoOffertaKind
): Promise<
  | { success: true; items: CatalogoOffertaItem[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(tableName(kind))
    .select("*")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (
      (data ?? []) as Array<CatalogoServizioRow | CatalogoProdottoFornitoreRow>
    ).map((row) => mapRow(kind, row)),
  };
}

export async function createCatalogoServizioAction(
  input: CatalogoOffertaInput
): Promise<
  | { success: true; item: CatalogoOffertaItem }
  | { success: false; error: string }
> {
  return createCatalogoAction("servizio", input);
}

export async function createCatalogoProdottoFornitoreAction(
  input: CatalogoOffertaInput
): Promise<
  | { success: true; item: CatalogoOffertaItem }
  | { success: false; error: string }
> {
  return createCatalogoAction("prodotto", input);
}

async function createCatalogoAction(
  kind: CatalogoOffertaKind,
  input: CatalogoOffertaInput
): Promise<
  | { success: true; item: CatalogoOffertaItem }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const normalized = normalizeCatalogoInput(kind, input);
  const prefix = kind === "servizio" ? "Sz" : "Pr";

  if (!normalized.codice || !normalized.nome) {
    return {
      success: false,
      error: "Codice e descrizione breve sono obbligatori.",
    };
  }
  if (!isValidCatalogoCodice(kind, normalized.codice)) {
    return {
      success: false,
      error: `Il codice deve iniziare con ${prefix} (maiuscole o minuscole), seguito da lettere, cifre o - _ /.`,
    };
  }

  const uniquenessError = await assertCodiceAndNomeUnici(
    kind,
    supabase,
    normalized.codice,
    normalized.nome
  );
  if (uniquenessError) return { success: false, error: uniquenessError };

  const { data, error } = await supabase
    .from(tableName(kind))
    .insert({
      codice: normalized.codice,
      nome: normalized.nome,
      note: normalized.note ?? "",
      is_bio: normalized.isBio ?? false,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error:
        error?.code === "23505"
          ? `Il codice ${normalized.codice} esiste già.`
          : error?.message ?? "Salvataggio non riuscito.",
    };
  }

  const row = data as CatalogoServizioRow | CatalogoProdottoFornitoreRow;
  await writeAuditLog({
    entity_type: entityType(kind),
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata voce catalogo ${row.codice}`,
    payload: { codice: row.codice, nome: row.nome, is_bio: row.is_bio },
  });

  return { success: true, item: mapRow(kind, row) };
}

export async function updateCatalogoServizioAction(
  id: string,
  input: CatalogoOffertaInput
): Promise<
  | { success: true; item: CatalogoOffertaItem; cascade?: { fatture: number; fornitori: number } }
  | { success: false; error: string }
> {
  return updateCatalogoAction("servizio", id, input);
}

export async function updateCatalogoProdottoFornitoreAction(
  id: string,
  input: CatalogoOffertaInput
): Promise<
  | { success: true; item: CatalogoOffertaItem; cascade?: { fatture: number; fornitori: number } }
  | { success: false; error: string }
> {
  return updateCatalogoAction("prodotto", id, input);
}

async function updateCatalogoAction(
  kind: CatalogoOffertaKind,
  id: string,
  input: CatalogoOffertaInput
): Promise<
  | { success: true; item: CatalogoOffertaItem; cascade?: { fatture: number; fornitori: number } }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const normalized = normalizeCatalogoInput(kind, input);
  const prefix = kind === "servizio" ? "Sz" : "Pr";
  const table = tableName(kind);
  const lifecycleKind = kind === "servizio" ? "servizio" : "prodotto";

  if (!normalized.codice || !normalized.nome) {
    return {
      success: false,
      error: "Codice e descrizione breve sono obbligatori.",
    };
  }
  if (!isValidCatalogoCodice(kind, normalized.codice)) {
    return {
      success: false,
      error: `Il codice deve iniziare con ${prefix} (maiuscole o minuscole), seguito da lettere, cifre o - _ /.`,
    };
  }

  const { data: existing, error: loadErr } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!existing) return { success: false, error: "Voce catalogo non trovata." };

  const uniquenessError = await assertCodiceAndNomeUnici(
    kind,
    supabase,
    normalized.codice,
    normalized.nome,
    id
  );
  if (uniquenessError) return { success: false, error: uniquenessError };

  const oldCodice = String(
    (existing as { codice: string }).codice
  );
  const oldNome = String((existing as { nome: string }).nome);

  const { data, error } = await supabase
    .from(table)
    .update({
      codice: normalized.codice,
      nome: normalized.nome,
      note: normalized.note ?? "",
      is_bio: normalized.isBio ?? false,
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
          ? `Il codice ${normalized.codice} esiste già.`
          : error?.message ?? "Aggiornamento non riuscito.",
    };
  }

  const { cascadeRenameCodice } = await import(
    "@/lib/amministrazione/catalogo-lifecycle"
  );
  const cascade = await cascadeRenameCodice({
    supabase,
    kind: lifecycleKind,
    oldCodice,
    newCodice: normalized.codice,
    newNome:
      normalized.nome !== oldNome || oldCodice !== normalized.codice
        ? normalized.nome
        : undefined,
    userId: auth.userId,
  });

  const row = data as CatalogoServizioRow | CatalogoProdottoFornitoreRow;
  await writeAuditLog({
    entity_type: entityType(kind),
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata voce catalogo ${row.codice}`,
    payload: {
      codice: row.codice,
      nome: row.nome,
      old_codice: oldCodice,
      cascade,
    },
  });

  return {
    success: true,
    item: mapRow(kind, row),
    cascade: {
      fatture: cascade.fattureAggiornate,
      fornitori: cascade.fornitoriAggiornati,
    },
  };
}

export type CatalogoDeleteResult =
  | {
      success: true;
      deleted: true;
    }
  | {
      success: true;
      deleted: false;
      pending: true;
      message: string;
      fattureRiaperte: Array<{
        fatturaId: string;
        numeroInterno: string;
        documentoStato: string;
        righe: number;
      }>;
    }
  | { success: false; error: string };

export async function softDeleteCatalogoServizioAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<CatalogoDeleteResult> {
  return softDeleteCatalogoAction("servizio", input);
}

export async function softDeleteCatalogoProdottoFornitoreAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<CatalogoDeleteResult> {
  return softDeleteCatalogoAction("prodotto", input);
}

async function softDeleteCatalogoAction(
  kind: CatalogoOffertaKind,
  input: { id: string; confermaTestuale: string }
): Promise<CatalogoDeleteResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const table = tableName(kind);
  const lifecycleKind = kind === "servizio" ? "servizio" : "prodotto";

  const { data: existing, error: loadError } = await supabase
    .from(table)
    .select("*")
    .eq("id", input.id)
    .maybeSingle();

  if (loadError) return { success: false, error: loadError.message };
  if (!existing || (existing as { deleted_at?: string | null }).deleted_at) {
    return { success: false, error: "Voce catalogo non trovata." };
  }

  const codice = String((existing as { codice: string }).codice);
  const expected = fraseConfermaSoftDelete(codice);
  if (input.confermaTestuale.trim() !== expected) {
    return {
      success: false,
      error: `Per confermare digita esattamente: ${expected}`,
    };
  }

  const {
    findCodiceRiferimenti,
    reopenFattureRicevuteToBozza,
    removeCodiceFromFornitoriSchede,
  } = await import("@/lib/amministrazione/catalogo-lifecycle");

  const refs = await findCodiceRiferimenti(supabase, codice, lifecycleKind);

  if (refs.fatture.length > 0) {
    await reopenFattureRicevuteToBozza({
      supabase,
      fatturaIds: refs.fatture.map((f) => f.fatturaId),
      userId: auth.userId,
      motivo: "Aggiornare o sostituire il codice sulle righe.",
      codice,
    });
    await supabase
      .from(table)
      .update({
        pending_delete_at: new Date().toISOString(),
        pending_delete_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", input.id);

    await writeAuditLog({
      entity_type: entityType(kind),
      entity_id: input.id,
      action: "pending_delete",
      actor_id: auth.userId,
      summary: `Eliminazione sospesa ${codice}: documenti riaperti`,
      payload: {
        codice,
        fatture: refs.fatture.map((f) => f.numeroInterno),
      },
    });

    return {
      success: true,
      deleted: false,
      pending: true,
      message: `Il codice ${codice} è ancora presente in ${refs.fatture.length} fattura/e. I documenti sono stati riaperti in bozza: aggiornali, poi ripeti l'eliminazione.`,
      fattureRiaperte: refs.fatture,
    };
  }

  // Solo schede fornitore: rimuovi codice e soft delete
  await removeCodiceFromFornitoriSchede({
    supabase,
    kind: lifecycleKind,
    codice,
    userId: auth.userId,
  });

  const { error } = await supabase
    .from(table)
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      pending_delete_at: null,
      pending_delete_by: null,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: entityType(kind),
    entity_id: input.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Soft delete catalogo ${codice}`,
    payload: { codice, nome: (existing as { nome: string }).nome },
  });

  return { success: true, deleted: true };
}
