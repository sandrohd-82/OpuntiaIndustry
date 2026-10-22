"use server";

import { z } from "zod";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import {
  parsePrenotazioneNumero,
  rpcNumeroEmesso,
  rpcPrenotazione,
  type PrenotazioneNumero,
} from "@/lib/amministrazione/numero-fattura-prenotazione";
import { createClient } from "@/lib/supabase/server";

const prenotaSchema = z.object({
  sessioneId: z.string().trim().min(8).max(80),
  dataDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contesto: z.enum(["ordine", "fattura"]),
});

async function clientPrenotazione() {
  await requireAnyAreaAccess(["commerciale", "amministrazione"]);
  return createClient();
}

export async function prenotaNumeroFatturaAction(raw: {
  sessioneId: string;
  dataDocumento: string;
  contesto: "ordine" | "fattura";
}): Promise<
  | { success: true; prenotazione: PrenotazioneNumero }
  | { success: false; error: string }
> {
  const parsed = prenotaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Prenotazione non valida.",
    };
  }
  try {
    const supabase = await clientPrenotazione();
    const prenotazione = await rpcPrenotazione(supabase, "prenota_numero_fattura", {
      p_data: parsed.data.dataDocumento,
      p_sessione: parsed.data.sessioneId,
      p_contesto: parsed.data.contesto,
    });
    return { success: true, prenotazione };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Numero non prenotato.",
    };
  }
}

export async function heartbeatNumeroFatturaAction(
  prenotazioneId: string
): Promise<
  | { success: true; prenotazione: PrenotazioneNumero }
  | { success: false; error: string }
> {
  const id = z.string().uuid().safeParse(prenotazioneId);
  if (!id.success) return { success: false, error: "Prenotazione non valida." };
  try {
    const supabase = await clientPrenotazione();
    const prenotazione = await rpcPrenotazione(
      supabase,
      "heartbeat_numero_fattura",
      { p_id: id.data }
    );
    return { success: true, prenotazione };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Controllo numero non riuscito.",
    };
  }
}

export async function rilasciaNumeroFatturaAction(
  prenotazioneId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const id = z.string().uuid().safeParse(prenotazioneId);
  if (!id.success) return { success: false, error: "Prenotazione non valida." };
  try {
    const supabase = await clientPrenotazione();
    await rpcPrenotazione(supabase, "rilascia_numero_fattura", { p_id: id.data });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Numero non rilasciato.",
    };
  }
}

export async function aggiudicaNumeroFatturaAction(raw: {
  prenotazioneId: string;
  ordineId?: string | null;
  fatturaId?: string | null;
}): Promise<
  | { success: true; prenotazione: PrenotazioneNumero }
  | { success: false; error: string }
> {
  const parsed = z
    .object({
      prenotazioneId: z.string().uuid(),
      ordineId: z.string().uuid().nullable().optional(),
      fatturaId: z.string().uuid().nullable().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Aggiudicazione non valida." };
  }
  try {
    const supabase = await clientPrenotazione();
    const prenotazione = await rpcPrenotazione(
      supabase,
      "aggiudica_numero_fattura",
      {
        p_id: parsed.data.prenotazioneId,
        p_ordine_id: parsed.data.ordineId ?? null,
        p_fattura_id: parsed.data.fatturaId ?? null,
      }
    );
    return { success: true, prenotazione };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Numero non aggiudicato.",
    };
  }
}

export async function emettiNumeroPrenotato(
  prenotazioneId: string,
  dataDocumento: string
): Promise<{ numeroFattura: string; numeroInterno: string }> {
  const supabase = await clientPrenotazione();
  return rpcNumeroEmesso(supabase, "emetti_numero_prenotato", {
    p_id: prenotazioneId,
    p_data: dataDocumento,
  });
}

export async function idPrenotazioneAggiudicataFattura(
  fatturaId: string
): Promise<string | null> {
  const supabase = await clientPrenotazione();
  const { data, error } = await supabase.rpc("leggi_prenotazione_fattura", {
    p_fattura_id: fatturaId,
  });
  if (error) throw new Error(error.message);
  if (data == null) return null;
  return parsePrenotazioneNumero(data).id;
}
