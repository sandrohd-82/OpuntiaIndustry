"use server";

import {
  defaultDestinatarioCooperativa,
  extractRawSources,
  mapFicRawToPaperInvoice,
  mapOpuntiaFatturaToPaperInvoice,
  type PaperInvoiceModel,
  type PaperInvoiceRawSource,
  type PaperParty,
} from "@/lib/amministrazione/paper-invoice";
import type { Fattura } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

export type PaperInvoicePayload = {
  model: PaperInvoiceModel;
  raw: PaperInvoiceRawSource;
  destinatario: PaperParty;
};

export async function getPaperInvoiceForRicevutaAction(input: {
  ficId: number | null;
  fattura: Fattura;
}): Promise<
  | { success: true; data: PaperInvoicePayload }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const destinatario = defaultDestinatarioCooperativa();

  if (input.ficId && Number.isFinite(input.ficId) && input.ficId > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("fic_invoices")
      .select("raw_data")
      .eq("fic_id", input.ficId)
      .eq("type", "received")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    const raw = (data?.raw_data ?? null) as Record<string, unknown> | null;
    if (raw && Object.keys(raw).length > 0) {
      return {
        success: true,
        data: {
          model: mapFicRawToPaperInvoice(raw, destinatario),
          raw: extractRawSources(raw),
          destinatario,
        },
      };
    }
  }

  return {
    success: true,
    data: {
      model: mapOpuntiaFatturaToPaperInvoice(input.fattura, destinatario),
      raw: {
        json: {
          fonte: "opuntia",
          numeroInterno: input.fattura.numeroInterno,
          note: "Payload FiC non disponibile: visualizzazione dai dati registrati in Opuntia.",
          fattura: input.fattura,
        },
        xml: null,
      },
      destinatario,
    },
  };
}
