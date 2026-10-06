"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  prodottoUscitaCompatibile,
  registraSottoprodottiSchema,
  type SottoprodottoPrenotazione,
} from "@/lib/produzione/sottoprodotti";
import { createClient } from "@/lib/supabase/server";

type RigaCampionatura = {
  id: string;
  prodotto_id: string | null;
  prodotto_codice: string;
  quantita: number;
  unita_misura: string;
};

type SceltaScaletta = {
  rigaId: string;
  lottoInternoCodice: string;
  lottoProdottoId: string;
  lottoProdottoCodice: string;
  conforme: boolean;
  processoId?: string | null;
  processoCodice?: string;
  processoNome?: string;
  sottoprodottoPrenotato?: boolean;
};

async function idProdottoProprio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string | null | undefined
): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase
    .from("prodotti_propri")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return data ? id : null;
}

export async function prenotaSottoprodottiCampionatura(input: {
  userId: string;
  campionaturaId: string;
  numeroDocumento: string;
  righe: RigaCampionatura[];
  scelte: SceltaScaletta[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const daPrenotare = input.scelte.filter((s) => s.sottoprodottoPrenotato);
  if (daPrenotare.length === 0) return { ok: true };

  const supabase = await createClient();
  const now = new Date().toISOString();

  for (const scelta of daPrenotare) {
    const riga = input.righe.find((r) => r.id === scelta.rigaId);
    if (!riga) {
      return { ok: false, error: "Riga campionatura non trovata per il secondo prodotto." };
    }
    if (scelta.conforme || !scelta.processoId) {
      return {
        ok: false,
        error: `Il secondo prodotto si prenota solo se ${riga.prodotto_codice} va trasformato.`,
      };
    }
    const qty = Number(riga.quantita);
    if (!Number.isFinite(qty) || qty <= 0) {
      return {
        ok: false,
        error: `Quantità di uscita non valida per ${riga.prodotto_codice}.`,
      };
    }
    const ingressoId = await idProdottoProprio(supabase, scelta.lottoProdottoId);
    const uscitaId = await idProdottoProprio(supabase, riga.prodotto_id);
    const { error } = await supabase.from("produzione_sottoprodotti").insert({
      campionatura_id: input.campionaturaId,
      campionatura_riga_id: riga.id,
      numero_documento: input.numeroDocumento,
      processo_id: scelta.processoId,
      processo_codice: scelta.processoCodice ?? "",
      processo_nome: scelta.processoNome ?? "",
      lotto_interno_codice: scelta.lottoInternoCodice,
      prodotto_ingresso_id: ingressoId,
      prodotto_ingresso_codice: scelta.lottoProdottoCodice,
      prodotto_uscita_id: uscitaId,
      prodotto_uscita_codice: riga.prodotto_codice,
      qty_uscita: qty,
      unita: riga.unita_misura || "kg",
      stato: "prenotato",
      documento_stato: "bozza",
      versione: 1,
      created_by: input.userId,
      updated_by: input.userId,
      created_at: now,
      updated_at: now,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  await writeAuditLog({
    entity_type: "produzione_sottoprodotti",
    entity_id: input.campionaturaId,
    action: "create",
    actor_id: input.userId,
    summary: `Prenotato un secondo prodotto per ${input.numeroDocumento}`,
    payload: {
      righe: daPrenotare.map((s) => s.rigaId),
    },
  });
  return { ok: true };
}

export async function annullaPrenotazioniCampionatura(
  campionaturaId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("produzione_sottoprodotti")
    .update({
      deleted_at: now,
      deleted_by: userId,
      updated_by: userId,
    })
    .eq("campionatura_id", campionaturaId)
    .eq("stato", "prenotato")
    .is("deleted_at", null);
}

type PrenotazioneRow = {
  id: string;
  campionatura_id: string;
  numero_documento: string;
  processo_codice: string;
  processo_nome: string;
  lotto_interno_codice: string;
  prodotto_ingresso_id: string | null;
  prodotto_ingresso_codice: string;
  prodotto_uscita_id: string | null;
  prodotto_uscita_codice: string;
  qty_uscita: number;
  unita: string;
};

function mapPrenotazione(row: PrenotazioneRow): SottoprodottoPrenotazione {
  return {
    id: row.id,
    campionaturaId: row.campionatura_id,
    numeroDocumento: row.numero_documento,
    processoCodice: row.processo_codice,
    processoNome: row.processo_nome,
    lottoInternoCodice: row.lotto_interno_codice,
    prodottoIngressoId: row.prodotto_ingresso_id,
    prodottoIngressoCodice: row.prodotto_ingresso_codice,
    prodottoUscitaId: row.prodotto_uscita_id,
    prodottoUscitaCodice: row.prodotto_uscita_codice,
    qtyUscita: Number(row.qty_uscita),
    unita: row.unita,
  };
}

export async function listSottoprodottiPerChiusuraAction(input: {
  codiceProdottoUscita: string;
}): Promise<
  | { success: true; items: SottoprodottoPrenotazione[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_sottoprodotti")
    .select(
      "id, campionatura_id, numero_documento, processo_codice, processo_nome, lotto_interno_codice, prodotto_ingresso_id, prodotto_ingresso_codice, prodotto_uscita_id, prodotto_uscita_codice, qty_uscita, unita"
    )
    .eq("stato", "prenotato")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const items = ((data ?? []) as PrenotazioneRow[])
    .filter((row) =>
      prodottoUscitaCompatibile(
        input.codiceProdottoUscita,
        row.prodotto_uscita_codice
      )
    )
    .map(mapPrenotazione);
  return { success: true, items };
}

export async function foglioHaSottoprodottoAperto(
  codiceProdottoUscita: string
): Promise<{ ok: true; aperti: number } | { ok: false; error: string }> {
  const listed = await listSottoprodottiPerChiusuraAction({
    codiceProdottoUscita,
  });
  if (!listed.success) return { ok: false, error: listed.error };
  return { ok: true, aperti: listed.items.length };
}

export async function registraSottoprodottiChiusuraAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = registraSottoprodottiSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati del secondo prodotto non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const attesi = await listSottoprodottiPerChiusuraAction({
    codiceProdottoUscita: input.codiceProdottoUscita,
  });
  if (!attesi.success) return attesi;
  const attesiIds = new Set(attesi.items.map((item) => item.id));
  const inviati = new Set(input.righe.map((riga) => riga.id));
  if (attesi.items.some((item) => !inviati.has(item.id))) {
    return {
      success: false,
      error: "Registra tutte le prenotazioni di secondo prodotto di questo foglio.",
    };
  }

  const now = new Date().toISOString();
  for (const riga of input.righe) {
    if (!attesiIds.has(riga.id)) {
      const { data: gia } = await supabase
        .from("produzione_sottoprodotti")
        .select("stato, foglio_id")
        .eq("id", riga.id)
        .is("deleted_at", null)
        .maybeSingle();
      const fatto = gia as { stato?: string; foglio_id?: string } | null;
      if (fatto?.stato === "registrato" && fatto.foglio_id === input.foglioId) {
        continue;
      }
      return {
        success: false,
        error: "Una prenotazione non appartiene al prodotto in uscita di questo foglio.",
      };
    }
    const pren = attesi.items.find((item) => item.id === riga.id);
    const { data: prodotto, error: prodErr } = await supabase
      .from("prodotti_propri")
      .select("id, codice")
      .eq("id", riga.prodottoSottoprodottoId)
      .maybeSingle();
    if (prodErr) return { success: false, error: prodErr.message };
    if (!prodotto) {
      return { success: false, error: "Il secondo prodotto non è nel catalogo." };
    }
    const codice = String((prodotto as { codice: string }).codice);
    const stessoIngresso =
      pren?.prodottoIngressoId === riga.prodottoSottoprodottoId ||
      pren?.prodottoIngressoCodice.trim().toUpperCase() === codice.toUpperCase();
    const stessaUscita =
      pren?.prodottoUscitaId === riga.prodottoSottoprodottoId ||
      pren?.prodottoUscitaCodice.trim().toUpperCase() === codice.toUpperCase();
    if (stessoIngresso || stessaUscita) {
      return {
        success: false,
        error: `Il secondo prodotto deve essere diverso da ${pren?.prodottoIngressoCodice} e da ${pren?.prodottoUscitaCodice}.`,
      };
    }
    const { data: aggiornata, error } = await supabase
      .from("produzione_sottoprodotti")
      .update({
        prodotto_sottoprodotto_id: riga.prodottoSottoprodottoId,
        prodotto_sottoprodotto_codice: codice,
        qty_consumata: riga.qtyConsumata,
        qty_sottoprodotto: riga.qtySottoprodotto,
        foglio_id: input.foglioId,
        stato: "registrato",
        documento_stato: "chiuso",
        versione: 2,
        registrato_at: now,
        registrato_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", riga.id)
      .eq("stato", "prenotato")
      .is("deleted_at", null)
      .select("id");
    if (error) return { success: false, error: error.message };
    if (!aggiornata?.length) {
      return {
        success: false,
        error: "La prenotazione del secondo prodotto non è più aperta.",
      };
    }
    await writeAuditLog({
      entity_type: "produzione_sottoprodotti",
      entity_id: riga.id,
      action: "status_change",
      actor_id: auth.userId,
      summary: `Registrato secondo prodotto ${codice} alla chiusura del foglio`,
      payload: {
        foglio_id: input.foglioId,
        qty_consumata: riga.qtyConsumata,
        qty_sottoprodotto: riga.qtySottoprodotto,
        prodotto_sottoprodotto_id: riga.prodottoSottoprodottoId,
      },
    });
  }
  return { success: true };
}
