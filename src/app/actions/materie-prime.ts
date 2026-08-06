"use server";

import { createClient } from "@/lib/supabase/server";
import {
  mapMateriaPrimaRow,
  normalizeMateriaPrimaInput,
  type MateriaPrima,
  type MateriaPrimaInput,
} from "@/lib/amministrazione/materie-prime";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { MateriaPrimaInsert, MateriaPrimaRow } from "@/types/database";

export type MateriePrimeActionResult =
  | { success: true; materia: MateriaPrima }
  | { success: false; error: string };

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

  const insert: MateriaPrimaInsert = {
    codice: normalized.codice,
    nome: normalized.nome,
    note: normalized.note ?? "",
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

  const { data, error } = await supabase
    .from("materie_prime")
    .update({
      codice: normalized.codice,
      nome: normalized.nome,
      note: normalized.note ?? "",
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
