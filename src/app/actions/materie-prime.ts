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
import { writeAuditLog } from "@/lib/audit";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
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
    .is("deleted_at", null)
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
    updated_by: auth.userId,
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

  const row = data as MateriaPrimaRow;
  await writeAuditLog({
    entity_type: "materie_prime",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata materia prima ${row.codice}`,
    payload: { codice: row.codice, nome: row.nome },
  });

  return { success: true, materia: mapMateriaPrimaRow(row) };
}

export async function updateMateriaPrimaAction(
  id: string,
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

  const row = data as MateriaPrimaRow;
  await writeAuditLog({
    entity_type: "materie_prime",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata materia prima ${row.codice}`,
    payload: { codice: row.codice, nome: row.nome },
  });

  return { success: true, materia: mapMateriaPrimaRow(row) };
}

export async function softDeleteMateriaPrimaAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data: existing, error: loadError } = await supabase
    .from("materie_prime")
    .select("id, codice, nome, deleted_at")
    .eq("id", input.id)
    .maybeSingle();

  if (loadError) return { success: false, error: loadError.message };
  if (!existing || existing.deleted_at) {
    return { success: false, error: "Materia prima non trovata." };
  }

  const codice = String(existing.codice);
  const expected = fraseConfermaSoftDelete(codice);
  if (input.confermaTestuale.trim() !== expected) {
    return {
      success: false,
      error: `Per confermare digita esattamente: ${expected}`,
    };
  }

  const { error } = await supabase
    .from("materie_prime")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "materie_prime",
    entity_id: input.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Soft delete materia prima ${codice}`,
    payload: {
      codice,
      nome: existing.nome,
      conferma: expected,
    },
  });

  return { success: true };
}
