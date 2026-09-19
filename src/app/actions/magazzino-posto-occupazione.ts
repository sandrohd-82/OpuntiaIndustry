"use server";

import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import {
  generaCodiceRandom,
  occupaPostoSchema,
  type OccupaPostoInput,
  type PostoElementoTipo,
  type PostoOccupazione,
} from "@/lib/magazzino/posto-occupazione";

async function codiceLibero(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tabella: "magazzino_posto_occupazioni" | "magazzino_posto_elementi",
  colonna: "codice_pallet" | "numero",
  lunghezza: number
): Promise<string> {
  for (let i = 0; i < 40; i += 1) {
    const code = generaCodiceRandom(lunghezza);
    const { data } = await supabase
      .from(tabella)
      .select("id")
      .is("deleted_at", null)
      .ilike(colonna, code)
      .maybeSingle();
    if (!data) return code;
  }
  return `${generaCodiceRandom(lunghezza)}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

async function syncStatoUbicazione(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ubicazioneId: string,
  stato: "libero" | "occupato",
  userId: string
) {
  await supabase
    .from("magazzino_ubicazioni")
    .update({
      occupazione_stato: stato,
      occupazione_at: new Date().toISOString(),
      occupazione_by: userId,
      updated_by: userId,
    })
    .eq("id", ubicazioneId)
    .is("deleted_at", null);
}

function mapOccupazione(
  row: {
    id: string;
    ubicazione_id: string;
    tipo_elemento: string;
    imballaggio_voce_id: string | null;
    imballaggio_nome: string;
    quantita_elementi: number | null;
    codice_pallet: string;
    lotto_interno_codice: string | null;
    lotto_esterno_id: string | null;
    lotto_esterno_codice: string | null;
    note: string;
  },
  elementi: Array<{
    id: string;
    numero: string;
    peso_kg: number | string | null;
    scan_token: string;
  }>
): PostoOccupazione {
  return {
    id: row.id,
    ubicazioneId: row.ubicazione_id,
    tipoElemento: row.tipo_elemento as PostoElementoTipo,
    imballaggioVoceId: row.imballaggio_voce_id,
    imballaggioNome: row.imballaggio_nome,
    quantitaElementi: row.quantita_elementi,
    codicePallet: row.codice_pallet,
    lottoInternoCodice: row.lotto_interno_codice,
    lottoEsternoId: row.lotto_esterno_id,
    lottoEsternoCodice: row.lotto_esterno_codice,
    note: row.note,
    elementi: elementi.map((e) => ({
      id: e.id,
      numero: e.numero,
      pesoKg: e.peso_kg != null ? Number(e.peso_kg) : null,
      scanToken: e.scan_token,
    })),
  };
}

export async function getOccupazionePostoAction(
  ubicazioneId: string
): Promise<
  | { success: true; occupazione: PostoOccupazione | null }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  if (!ubicazioneId) return { success: true, occupazione: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_posto_occupazioni")
    .select(
      "id, ubicazione_id, tipo_elemento, imballaggio_voce_id, imballaggio_nome, quantita_elementi, codice_pallet, lotto_interno_codice, lotto_esterno_id, lotto_esterno_codice, note"
    )
    .eq("ubicazione_id", ubicazioneId)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, occupazione: null };
  const row = data as Parameters<typeof mapOccupazione>[0];
  const { data: els } = await supabase
    .from("magazzino_posto_elementi")
    .select("id, numero, peso_kg, scan_token, sort_order")
    .eq("occupazione_id", row.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  return {
    success: true,
    occupazione: mapOccupazione(
      row,
      (els ?? []) as Parameters<typeof mapOccupazione>[1]
    ),
  };
}

export async function occupaPostoAction(
  raw: OccupaPostoInput
): Promise<
  | { success: true; occupazione: PostoOccupazione }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess([
    "magazzino",
    "amministrazione",
  ]);
  const parsed = occupaPostoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati occupazione non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();

  const { data: ubi } = await supabase
    .from("magazzino_ubicazioni")
    .select("id, codice")
    .eq("id", input.ubicazioneId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ubi) return { success: false, error: "Posto non trovato." };

  const { data: attiva } = await supabase
    .from("magazzino_posto_occupazioni")
    .select("id")
    .eq("ubicazione_id", input.ubicazioneId)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  if (attiva) {
    return { success: false, error: "Questo posto è già occupato." };
  }

  const { data: voce } = await supabase
    .from("imballaggi_voci")
    .select("id, nome, stadio")
    .eq("id", input.imballaggioVoceId)
    .is("deleted_at", null)
    .maybeSingle();
  const v = voce as { id: string; nome: string; stadio?: string } | null;
  if (!v) return { success: false, error: "Voce di movimentazione non trovata." };

  let lottoEsternoId: string | null = null;
  const lottoEsternoCodice = input.lottoEsternoCodice?.trim() || null;
  if (lottoEsternoCodice) {
    const { data: le } = await supabase
      .from("lotti_esterni")
      .select("id, codice")
      .ilike("codice", lottoEsternoCodice)
      .is("deleted_at", null)
      .maybeSingle();
    lottoEsternoId = (le as { id?: string } | null)?.id ?? null;
  }

  const codicePallet = await codiceLibero(
    supabase,
    "magazzino_posto_occupazioni",
    "codice_pallet",
    6
  );
  const qty = input.quantitaElementi ?? null;

  const { data: created, error } = await supabase
    .from("magazzino_posto_occupazioni")
    .insert({
      ubicazione_id: input.ubicazioneId,
      tipo_elemento: input.tipoElemento,
      imballaggio_voce_id: v.id,
      imballaggio_nome: v.nome,
      quantita_elementi: qty,
      codice_pallet: codicePallet,
      lotto_interno_codice: input.lottoInternoCodice?.trim() || null,
      lotto_esterno_id: lottoEsternoId,
      lotto_esterno_codice: lottoEsternoCodice,
      stato: "attivo",
      documento_stato: "bozza",
      note: input.note?.trim() || "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { success: false, error: error?.message ?? "Occupazione non salvata." };
  }
  const occId = (created as { id: string }).id;

  const elementi: Array<{
    id: string;
    numero: string;
    peso_kg: number | string | null;
    scan_token: string;
  }> = [];
  if (qty && qty > 0) {
    for (let i = 0; i < qty; i += 1) {
      const numero = await codiceLibero(
        supabase,
        "magazzino_posto_elementi",
        "numero",
        5
      );
      const { data: el, error: elErr } = await supabase
        .from("magazzino_posto_elementi")
        .insert({
          occupazione_id: occId,
          numero,
          peso_kg: input.pesoKg ?? null,
          scan_token: randomUUID(),
          sort_order: i,
          created_by: auth.userId,
          updated_by: auth.userId,
        })
        .select("id, numero, peso_kg, scan_token")
        .single();
      if (elErr || !el) {
        return {
          success: false,
          error: elErr?.message ?? "Creazione elemento fallita.",
        };
      }
      elementi.push(el as (typeof elementi)[number]);
    }
  }

  await syncStatoUbicazione(supabase, input.ubicazioneId, "occupato", auth.userId);
  const occupazione = mapOccupazione(
    {
      id: occId,
      ubicazione_id: input.ubicazioneId,
      tipo_elemento: input.tipoElemento,
      imballaggio_voce_id: v.id,
      imballaggio_nome: v.nome,
      quantita_elementi: qty,
      codice_pallet: codicePallet,
      lotto_interno_codice: input.lottoInternoCodice?.trim() || null,
      lotto_esterno_id: lottoEsternoId,
      lotto_esterno_codice: lottoEsternoCodice,
      note: input.note?.trim() || "",
    },
    elementi
  );
  await writeAuditLog({
    entity_type: "magazzino_posto_occupazioni",
    entity_id: occId,
    action: "create",
    actor_id: auth.userId,
    summary: `Occupato posto ${(ubi as { codice?: string }).codice ?? ""} con pallet ${codicePallet}`,
    payload: {
      ubicazione_id: input.ubicazioneId,
      tipo: input.tipoElemento,
      imballaggio: v.nome,
      quantita: qty,
      codice_pallet: codicePallet,
      lotto_interno: occupazione.lottoInternoCodice,
      lotto_esterno: occupazione.lottoEsternoCodice,
    },
  });
  return { success: true, occupazione };
}

export async function liberaPostoAction(
  ubicazioneId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess([
    "magazzino",
    "amministrazione",
  ]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("magazzino_posto_occupazioni")
    .select("id, codice_pallet")
    .eq("ubicazione_id", ubicazioneId)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as { id: string; codice_pallet: string } | null;
  if (!row) return { success: false, error: "Nessuna occupazione attiva." };
  const now = new Date().toISOString();
  await supabase
    .from("magazzino_posto_elementi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("occupazione_id", row.id)
    .is("deleted_at", null);
  const { error } = await supabase
    .from("magazzino_posto_occupazioni")
    .update({
      stato: "liberato",
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", row.id);
  if (error) return { success: false, error: error.message };
  await syncStatoUbicazione(supabase, ubicazioneId, "libero", auth.userId);
  await writeAuditLog({
    entity_type: "magazzino_posto_occupazioni",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Liberato posto, pallet ${row.codice_pallet} chiuso (numeri riusabili)`,
    payload: { ubicazione_id: ubicazioneId, codice_pallet: row.codice_pallet },
  });
  return { success: true };
}

export async function rimuoviElementoPostoAction(
  elementoId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess([
    "magazzino",
    "amministrazione",
  ]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("magazzino_posto_elementi")
    .select("id, numero, occupazione_id")
    .eq("id", elementoId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as {
    id: string;
    numero: string;
    occupazione_id: string;
  } | null;
  if (!row) return { success: false, error: "Elemento già rimosso." };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("magazzino_posto_elementi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", row.id);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "magazzino_posto_elementi",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Rimosso elemento ${row.numero} (numero riusabile)`,
    payload: {
      occupazione_id: row.occupazione_id,
      numero: row.numero,
    },
  });
  return { success: true };
}
