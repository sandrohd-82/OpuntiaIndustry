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
    .ilike("codice", codice)
    .is("deleted_at", null)
    .limit(5);
  if (excludeId) codiceQuery = codiceQuery.neq("id", excludeId);
  const { data: byCodiceRows, error: codiceError } = await codiceQuery;
  if (codiceError) return codiceError.message;
  const codiceLower = codice.toLowerCase();
  const byCodice = (
    (byCodiceRows ?? []) as Array<{ id: string; codice: string }>
  ).find((row) => row.codice.toLowerCase() === codiceLower);
  if (byCodice) {
    return `Il codice ${codice} esiste già. La targa deve essere univoca.`;
  }

  const nomeTrim = nome.trim();
  if (!nomeTrim) return null;
  const nomeNorm = normalizeNomeMateriaPrima(nome);
  let nomeQuery = supabase
    .from("materie_prime")
    .select("id, nome, codice")
    .ilike("nome", nomeTrim)
    .is("deleted_at", null)
    .limit(20);
  if (excludeId) nomeQuery = nomeQuery.neq("id", excludeId);
  const { data: rows, error: nomeError } = await nomeQuery;
  if (nomeError) return nomeError.message;

  const duplicateNome = (
    (rows ?? []) as Array<{ id: string; nome: string; codice: string }>
  ).find((row) => normalizeNomeMateriaPrima(row.nome) === nomeNorm);

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
  const PAGE = 1000;
  const materie: MateriaPrima[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from("materie_prime")
      .select(
        "id, codice, nome, note, is_bio, created_at, pending_delete_at, deleted_at, created_by, updated_at, updated_by"
      )
      .is("deleted_at", null)
      .order("codice", { ascending: true })
      .range(from, to);
    if (error) return { success: false, error: error.message };
    const rows = (data ?? []) as MateriaPrimaRow[];
    for (const row of rows) materie.push(mapMateriaPrimaRow(row));
    if (rows.length < PAGE) break;
  }
  return { success: true, materie };
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

  const { data: existingRow } = await supabase
    .from("materie_prime")
    .select("codice, nome")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const oldCodice = String(
    (existingRow as { codice?: string } | null)?.codice ?? ""
  );
  const oldNome = String(
    (existingRow as { nome?: string } | null)?.nome ?? ""
  );

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

  const { cascadeRenameCodice } = await import(
    "@/lib/amministrazione/catalogo-lifecycle"
  );
  const cascade = await cascadeRenameCodice({
    supabase,
    kind: "materia",
    oldCodice,
    newCodice: normalized.codice,
    newNome:
      normalized.nome !== oldNome || oldCodice !== normalized.codice
        ? normalized.nome
        : undefined,
    userId: auth.userId,
  });

  const row = data as MateriaPrimaRow;
  await writeAuditLog({
    entity_type: "materie_prime",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata materia prima ${row.codice}`,
    payload: { codice: row.codice, nome: row.nome, old_codice: oldCodice, cascade },
  });

  return { success: true, materia: mapMateriaPrimaRow(row) };
}

export type MateriaDeleteResult =
  | { success: true; deleted: true }
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

export async function softDeleteMateriaPrimaAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<MateriaDeleteResult> {
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

  const {
    findCodiceRiferimenti,
    reopenFattureRicevuteToBozza,
    removeCodiceFromFornitoriSchede,
  } = await import("@/lib/amministrazione/catalogo-lifecycle");

  const refs = await findCodiceRiferimenti(supabase, codice, "materia");

  if (refs.fatture.length > 0) {
    await reopenFattureRicevuteToBozza({
      supabase,
      fatturaIds: refs.fatture.map((f) => f.fatturaId),
      userId: auth.userId,
      motivo: "Aggiornare o sostituire il codice sulle righe.",
      codice,
    });
    await supabase
      .from("materie_prime")
      .update({
        pending_delete_at: new Date().toISOString(),
        pending_delete_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", input.id);

    await writeAuditLog({
      entity_type: "materie_prime",
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

  await removeCodiceFromFornitoriSchede({
    supabase,
    kind: "materia",
    codice,
    userId: auth.userId,
  });

  const { error } = await supabase
    .from("materie_prime")
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

  return { success: true, deleted: true };
}
