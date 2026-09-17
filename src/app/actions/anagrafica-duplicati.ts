"use server";

import { z } from "zod";
import {
  compareAnagraficaDraft,
  draftFromClienteInput,
  type AnagraficaCandidateCompare,
  type AnagraficaDuplicatoHit,
} from "@/lib/amministrazione/anagrafica-duplicati";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

const draftSchema = z.object({
  ragioneSociale: z.string().trim().min(1).max(200),
  partitaIva: z.string().optional().default(""),
  codiceFiscale: z.string().optional().default(""),
  email: z.string().optional().default(""),
  pec: z.string().optional().default(""),
  telefono: z.string().optional().default(""),
  emailGeneriche: z.array(z.string()).optional().default([]),
  telefoniGenerici: z.array(z.string()).optional().default([]),
  sedeAmministrativa: z
    .object({
      citta: z.string().optional().default(""),
      indirizzo: z.string().optional().default(""),
    })
    .optional(),
});

function mapClienteCandidate(r: Record<string, unknown>): AnagraficaCandidateCompare {
  return {
    id: String(r.id),
    kind: "cliente",
    codiceTarga: r.codice_targa ? String(r.codice_targa) : null,
    ragioneSociale: String(r.ragione_sociale ?? ""),
    partitaIva: String(r.partita_iva ?? ""),
    codiceFiscale: String(r.codice_fiscale ?? ""),
    email: String(r.email ?? ""),
    pec: String(r.pec ?? ""),
    telefono: String(r.telefono ?? ""),
    emailGeneriche: Array.isArray(r.email_generiche)
      ? (r.email_generiche as string[])
      : [],
    telefoniGenerici: Array.isArray(r.telefoni_generici)
      ? (r.telefoni_generici as string[])
      : [],
    citta: String(r.sede_amm_citta ?? ""),
    indirizzo: String(r.sede_amm_indirizzo ?? ""),
  };
}

function mapLeadCandidate(r: Record<string, unknown>): AnagraficaCandidateCompare {
  return {
    id: String(r.id),
    kind: "cliente_possibile",
    codiceTarga: null,
    ragioneSociale: String(r.ragione_sociale ?? ""),
    partitaIva: String(r.partita_iva ?? ""),
    codiceFiscale: String(r.codice_fiscale ?? ""),
    email: String(r.email ?? ""),
    pec: String(r.pec ?? ""),
    telefono: String(r.telefono ?? ""),
    emailGeneriche: Array.isArray(r.email_generiche)
      ? (r.email_generiche as string[])
      : [],
    telefoniGenerici: Array.isArray(r.telefoni_generici)
      ? (r.telefoni_generici as string[])
      : [],
    citta: String(r.sede_amm_citta ?? ""),
    indirizzo: String(r.sede_amm_indirizzo ?? ""),
  };
}

export async function findAnagraficaDuplicati(
  raw: unknown
): Promise<
  | { success: true; matches: AnagraficaDuplicatoHit[] }
  | { success: false; error: string }
> {
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati anagrafici non validi per il confronto." };
  }
  const draft = draftFromClienteInput(parsed.data);
  const supabase = await createClient();

  const [clientiRes, leadRes] = await Promise.all([
    supabase
      .from("clienti")
      .select(
        "id, codice_targa, ragione_sociale, partita_iva, codice_fiscale, email, pec, telefono, email_generiche, telefoni_generici, sede_amm_citta, sede_amm_indirizzo"
      )
      .is("deleted_at", null)
      .limit(2000),
    supabase
      .from("clienti_possibili")
      .select(
        "id, ragione_sociale, partita_iva, codice_fiscale, email, pec, telefono, email_generiche, telefoni_generici, sede_amm_citta, sede_amm_indirizzo, stato"
      )
      .is("deleted_at", null)
      .neq("stato", "scartato")
      .neq("stato", "convertito")
      .limit(2000),
  ]);
  if (clientiRes.error) return { success: false, error: clientiRes.error.message };
  if (leadRes.error) return { success: false, error: leadRes.error.message };

  const matches: AnagraficaDuplicatoHit[] = [];
  for (const r of clientiRes.data ?? []) {
    const hit = compareAnagraficaDraft(
      draft,
      mapClienteCandidate(r as Record<string, unknown>)
    );
    if (hit) matches.push(hit);
  }
  for (const r of leadRes.data ?? []) {
    const hit = compareAnagraficaDraft(
      draft,
      mapLeadCandidate(r as Record<string, unknown>)
    );
    if (hit) matches.push(hit);
  }
  matches.sort((a, b) => b.score - a.score);
  return { success: true, matches: matches.slice(0, 12) };
}

export async function checkAnagraficaDuplicatiAction(
  raw: unknown
): Promise<
  | { success: true; matches: AnagraficaDuplicatoHit[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "commerciale", "webmail"]);
  return findAnagraficaDuplicati(raw);
}
