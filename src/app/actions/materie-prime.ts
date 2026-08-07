"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isValidCodiceMateriaPrima,
  mapMateriaPrimaRow,
  normalizeMateriaPrimaInput,
  normalizeNomeMateriaPrima,
  type MateriaPrima,
  type MateriaPrimaInput,
} from "@/lib/amministrazione/materie-prime";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { MateriaPrimaInsert, MateriaPrimaRow } from "@/types/database";

export type MateriePrimeActionResult =
  | { success: true; materia: MateriaPrima }
  | { success: false; error: string };

async function assertCodiceAndNomeUnici(
  supabase: Awaited<ReturnType<typeof createClient>>,
  codice: string,
  nome: string,
  excludeId?: string
): Promise<string | null> {
  let codiceQuery = supabase
    .from("materie_prime")
    .select("id, codice")
    .eq("codice", codice);
  if (excludeId) codiceQuery = codiceQuery.neq("id", excludeId);
  const { data: byCodice, error: codiceError } = await codiceQuery.maybeSingle();
  if (codiceError) return codiceError.message;
  if (byCodice) {
    return `Il codice ${codice} esiste già. La targa deve essere univoca.`;
  }

  const nomeNorm = normalizeNomeMateriaPrima(nome);
  const { data: rows, error: nomeError } = await supabase
    .from("materie_prime")
    .select("id, nome, codice");
  if (nomeError) return nomeError.message;

  const duplicateNome = ((rows ?? []) as Array<{ id: string; nome: string; codice: string }>)
    .filter((row) => !excludeId || row.id !== excludeId)
    .find((row) => normalizeNomeMateriaPrima(row.nome) === nomeNorm);

  if (duplicateNome) {
    return `Esiste già una materia con lo stesso nome (${duplicateNome.codice} — ${duplicateNome.nome}).`;
  }

  return null;
}

export async function listMateriePrimeAction(): Promise<
  | { success: true; materie: MateriaPrima[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("materie_prime")
    .select("*")
    .order("codice", { ascending: true });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    materie: ((data ?? []) as MateriaPrimaRow[]).map(mapMateriaPrimaRow),
  };
}

export async function createMateriaPrimaAction(
  input: MateriaPrimaInput
): Promise<MateriePrimeActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const normalized = normalizeMateriaPrimaInput(input);

  if (!normalized.codice || !normalized.nome) {
    return { success: false, error: "Codice e nome sono obbligatori." };
  }

  if (!isValidCodiceMateriaPrima(normalized.codice)) {
    return {
      success: false,
      error:
        "Il codice deve iniziare con Mp, seguito da lettere, cifre o - _ /.",
    };
  }

  const uniquenessError = await assertCodiceAndNomeUnici(
    supabase,
    normalized.codice,
    normalized.nome
  );
  if (uniquenessError) return { success: false, error: uniquenessError };

  const insert: MateriaPrimaInsert = {
    codice: normalized.codice,
    nome: normalized.nome,
    note: normalized.note ?? "",
    is_bio: Boolean(normalized.isBio),
    fornitore_bio_id: null,
    bio_certificato: "",
    bio_codice: "",
    created_by: auth.userId,
  };

  const { data, error } = await supabase
    .from("materie_prime")
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

  return { success: true, materia: mapMateriaPrimaRow(data as MateriaPrimaRow) };
}

export async function updateMateriaPrimaAction(
  id: string,
  input: MateriaPrimaInput
): Promise<MateriePrimeActionResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const normalized = normalizeMateriaPrimaInput(input);

  if (!normalized.codice || !normalized.nome) {
    return { success: false, error: "Codice e nome sono obbligatori." };
  }

  if (!isValidCodiceMateriaPrima(normalized.codice)) {
    return {
      success: false,
      error:
        "Il codice deve iniziare con Mp, seguito da lettere, cifre o - _ /.",
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
    .from("materie_prime")
    .update({
      codice: normalized.codice,
      nome: normalized.nome,
      note: normalized.note ?? "",
      is_bio: Boolean(normalized.isBio),
      fornitore_bio_id: null,
      bio_certificato: "",
      bio_codice: "",
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

  return { success: true, materia: mapMateriaPrimaRow(data as MateriaPrimaRow) };
}
