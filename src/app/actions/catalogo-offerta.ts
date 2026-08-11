"use server";

import {
  mapCatalogoProdottoFornitore,
  mapCatalogoServizio,
  nextCatalogoCodice,
  type CatalogoOffertaItem,
} from "@/lib/amministrazione/catalogo-offerta";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type {
  CatalogoProdottoFornitoreRow,
  CatalogoServizioRow,
} from "@/types/database";

export async function listCatalogoServiziAction(): Promise<
  | { success: true; items: CatalogoOffertaItem[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogo_servizi")
    .select("*")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as CatalogoServizioRow[]).map(mapCatalogoServizio),
  };
}

export async function createCatalogoServizioAction(input: {
  nome: string;
}): Promise<
  | { success: true; item: CatalogoOffertaItem }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const nome = input.nome.trim();
  if (!nome) return { success: false, error: "Inserisci il nome del servizio." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("catalogo_servizi")
    .select("codice");
  const codice = nextCatalogoCodice(
    "SRV",
    (existing ?? []).map((r) => String(r.codice))
  );

  const { data, error } = await supabase
    .from("catalogo_servizi")
    .insert({
      codice,
      nome,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Creazione servizio non riuscita.",
    };
  }

  const row = data as CatalogoServizioRow;
  await writeAuditLog({
    entity_type: "catalogo_servizi",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato servizio catalogo ${row.codice}`,
    payload: { codice: row.codice, nome: row.nome },
  });

  return { success: true, item: mapCatalogoServizio(row) };
}

export async function listCatalogoProdottiFornitoreAction(): Promise<
  | { success: true; items: CatalogoOffertaItem[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogo_prodotti_fornitore")
    .select("*")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as CatalogoProdottoFornitoreRow[]).map(
      mapCatalogoProdottoFornitore
    ),
  };
}

export async function createCatalogoProdottoFornitoreAction(input: {
  nome: string;
}): Promise<
  | { success: true; item: CatalogoOffertaItem }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const nome = input.nome.trim();
  if (!nome) return { success: false, error: "Inserisci il nome del prodotto." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("catalogo_prodotti_fornitore")
    .select("codice");
  const codice = nextCatalogoCodice(
    "PRF",
    (existing ?? []).map((r) => String(r.codice))
  );

  const { data, error } = await supabase
    .from("catalogo_prodotti_fornitore")
    .insert({
      codice,
      nome,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Creazione prodotto non riuscita.",
    };
  }

  const row = data as CatalogoProdottoFornitoreRow;
  await writeAuditLog({
    entity_type: "catalogo_prodotti_fornitore",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato prodotto fornitore catalogo ${row.codice}`,
    payload: { codice: row.codice, nome: row.nome },
  });

  return { success: true, item: mapCatalogoProdottoFornitore(row) };
}
