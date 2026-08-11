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
