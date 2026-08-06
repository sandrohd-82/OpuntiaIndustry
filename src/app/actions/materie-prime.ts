"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isValidCodiceMateriaPrima,
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

async function resolveBioFromFornitore(
  fornitoreId: string | null | undefined,
  isBio: boolean
): Promise<{ bioCertificato: string; bioCodice: string; fornitoreBioId: string | null }> {
  if (!isBio || !fornitoreId) {
    return { bioCertificato: "", bioCodice: "", fornitoreBioId: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori")
    .select("id, bio_certificato, bio_codice")
    .eq("id", fornitoreId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Fornitore bio non trovato.");
  }

  return {
    fornitoreBioId: data.id as string,
    bioCertificato: String(data.bio_certificato ?? ""),
    bioCodice: String(data.bio_codice ?? ""),
  };
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
        "Il codice deve essere alfanumerico (lettere minuscole/maiuscole e cifre).",
    };
  }

  if (normalized.isBio && !normalized.fornitoreBioId) {
    return {
      success: false,
      error: "Per una materia Bio seleziona il fornitore di riferimento.",
    };
  }

  let bio;
  try {
    bio = await resolveBioFromFornitore(
      normalized.fornitoreBioId,
      Boolean(normalized.isBio)
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore dati bio fornitore.",
    };
  }

  const insert: MateriaPrimaInsert = {
    codice: normalized.codice,
    nome: normalized.nome,
    note: normalized.note ?? "",
    is_bio: Boolean(normalized.isBio),
    fornitore_bio_id: bio.fornitoreBioId,
    bio_certificato: bio.bioCertificato,
    bio_codice: bio.bioCodice,
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
        "Il codice deve essere alfanumerico (lettere minuscole/maiuscole e cifre).",
    };
  }

  if (normalized.isBio && !normalized.fornitoreBioId) {
    return {
      success: false,
      error: "Per una materia Bio seleziona il fornitore di riferimento.",
    };
  }

  let bio;
  try {
    bio = await resolveBioFromFornitore(
      normalized.fornitoreBioId,
      Boolean(normalized.isBio)
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore dati bio fornitore.",
    };
  }

  const { data, error } = await supabase
    .from("materie_prime")
    .update({
      codice: normalized.codice,
      nome: normalized.nome,
      note: normalized.note ?? "",
      is_bio: Boolean(normalized.isBio),
      fornitore_bio_id: bio.fornitoreBioId,
      bio_certificato: bio.bioCertificato,
      bio_codice: bio.bioCodice,
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
