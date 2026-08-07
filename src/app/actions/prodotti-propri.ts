"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isValidCodiceProdottoProprio,
  mapProdottoProprioRow,
  normalizeNomeProdottoProprio,
  normalizeProdottoProprioInput,
  type ProdottoProprio,
  type ProdottoProprioInput,
} from "@/lib/amministrazione/prodotti-propri";
import { requireAreaAccess } from "@/lib/areas/guard";
import type {
  ProdottoProprioInsert,
  ProdottoProprioRow,
} from "@/types/database";

export type ProdottiPropriActionResult =
  | { success: true; prodotto: ProdottoProprio }
  | { success: false; error: string };

async function assertCodiceAndNomeUnici(
  supabase: Awaited<ReturnType<typeof createClient>>,
  codice: string,
  nome: string,
  excludeId?: string
): Promise<string | null> {
  let codiceQuery = supabase
    .from("prodotti_propri")
    .select("id, codice")
    .eq("codice", codice);
  if (excludeId) codiceQuery = codiceQuery.neq("id", excludeId);
  const { data: byCodice, error: codiceError } = await codiceQuery.maybeSingle();
  if (codiceError) return codiceError.message;
  if (byCodice) {
    return `Il codice ${codice} esiste già. La targa deve essere univoca.`;
  }

  const nomeNorm = normalizeNomeProdottoProprio(nome);
  const { data: rows, error: nomeError } = await supabase
    .from("prodotti_propri")
    .select("id, nome, codice");
  if (nomeError) return nomeError.message;

  const duplicateNome = (
    (rows ?? []) as Array<{ id: string; nome: string; codice: string }>
  )
    .filter((row) => !excludeId || row.id !== excludeId)
    .find((row) => normalizeNomeProdottoProprio(row.nome) === nomeNorm);

  if (duplicateNome) {
    return `Esiste già un prodotto con lo stesso nome (${duplicateNome.codice} — ${duplicateNome.nome}).`;
  }

  return null;
}

export async function listProdottiPropriAction(): Promise<
  | { success: true; prodotti: ProdottoProprio[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prodotti_propri")
    .select("*")
    .order("codice", { ascending: true });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    prodotti: ((data ?? []) as ProdottoProprioRow[]).map(mapProdottoProprioRow),
  };
}

export async function createProdottoProprioAction(
  input: ProdottoProprioInput
): Promise<ProdottiPropriActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const normalized = normalizeProdottoProprioInput(input);

  if (!normalized.codice || !normalized.nome) {
    return { success: false, error: "Codice e nome sono obbligatori." };
  }

  if (!isValidCodiceProdottoProprio(normalized.codice)) {
    return {
      success: false,
      error:
        "Il codice deve iniziare con Pp, seguito da lettere, cifre o - _ /.",
    };
  }

  const uniquenessError = await assertCodiceAndNomeUnici(
    supabase,
    normalized.codice,
    normalized.nome
  );
  if (uniquenessError) return { success: false, error: uniquenessError };

  const insert: ProdottoProprioInsert = {
    codice: normalized.codice,
    nome: normalized.nome,
    note: normalized.note ?? "",
    is_bio: Boolean(normalized.isBio),
    created_by: auth.userId,
  };

  const { data, error } = await supabase
    .from("prodotti_propri")
    .insert(insert)
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

  return {
    success: true,
    prodotto: mapProdottoProprioRow(data as ProdottoProprioRow),
  };
}

export async function updateProdottoProprioAction(
  id: string,
  input: ProdottoProprioInput
): Promise<ProdottiPropriActionResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const normalized = normalizeProdottoProprioInput(input);

  if (!normalized.codice || !normalized.nome) {
    return { success: false, error: "Codice e nome sono obbligatori." };
  }

  if (!isValidCodiceProdottoProprio(normalized.codice)) {
    return {
      success: false,
      error:
        "Il codice deve iniziare con Pp, seguito da lettere, cifre o - _ /.",
    };
  }

  const uniquenessError = await assertCodiceAndNomeUnici(
    supabase,
    normalized.codice,
    normalized.nome,
    id
  );
  if (uniquenessError) return { success: false, error: uniquenessError };

  const { data, error } = await supabase
    .from("prodotti_propri")
    .update({
      codice: normalized.codice,
      nome: normalized.nome,
      note: normalized.note ?? "",
      is_bio: Boolean(normalized.isBio),
    })
    .eq("id", id)
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

  return {
    success: true,
    prodotto: mapProdottoProprioRow(data as ProdottoProprioRow),
  };
}
