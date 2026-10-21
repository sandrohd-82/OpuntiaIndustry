"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { buildNumeroInternoOrdine } from "@/lib/amministrazione/ordini";
import {
  anteprimaNumeroFattura,
  anteprimaNumeroProforma,
} from "@/lib/amministrazione/numero-fattura";
import { isOrdineProva, oggiRoma } from "@/lib/amministrazione/prova-ordine";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const clienteSchema = z.object({
  clienteId: z.string().uuid("Scegli il cliente."),
});

export type ClienteNumerazione = {
  id: string;
  ragioneSociale: string;
  codiceTarga: string;
};

export type NumerazioneReale = {
  cliente: string;
  codiceTarga: string;
  data: string;
  numeroOrdine: string;
  numeroFattura: string;
  numeroInternoFattura: string;
  numeroProforma: string;
};

export type ProvaOrdineAperta = {
  ordineId: string;
  numeroOrdine: string;
  numeroFattura: string;
  email: string;
  cliente: string;
};

async function richiediAdmin() {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "produzione"]);
  if (!isAdminLikeProfile(auth.profile)) {
    return {
      ok: false as const,
      error: "Solo un amministratore può controllare la numerazione.",
    };
  }
  return { ok: true as const, auth };
}

function prossimoSeqOrdine(
  righe: Array<{ numero_interno: string | null; cliente_id: string | null }>,
  clienteId: string,
  codiceTarga: string
): number {
  const targa = codiceTarga.trim().toUpperCase();
  const re = new RegExp(
    `^Or-\\d{2}-${targa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let countById = 0;
  let maxParsed = 0;
  for (const row of righe) {
    if (row.cliente_id === clienteId) countById += 1;
    const match = String(row.numero_interno ?? "").match(re);
    if (match) maxParsed = Math.max(maxParsed, Number(match[1]));
  }
  return Math.max(countById, maxParsed) + 1;
}

export async function elencoClientiNumerazioneAction(): Promise<
  | { success: true; clienti: ClienteNumerazione[] }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti")
    .select("id, ragione_sociale, codice_targa")
    .is("deleted_at", null)
    .order("ragione_sociale", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    clienti: (data ?? []).map((riga) => ({
      id: riga.id,
      ragioneSociale: riga.ragione_sociale,
      codiceTarga: String(riga.codice_targa ?? "").trim().toUpperCase(),
    })),
  };
}

/** Legge i prossimi numeri veri. Non inserisce, non assegna, non invia. */
export async function anteprimaNumerazioneRealeAction(raw: {
  clienteId?: string;
}): Promise<
  | { success: true; numerazione: NumerazioneReale }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const parsed = clienteSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Scegli il cliente.",
    };
  }
  const supabase = await createClient();
  const { data: cliente, error: clienteErr } = await supabase
    .from("clienti")
    .select("id, ragione_sociale, codice_targa")
    .eq("id", parsed.data.clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (clienteErr) return { success: false, error: clienteErr.message };
  if (!cliente) return { success: false, error: "Cliente non trovato." };

  const data = oggiRoma();
  const targa = String(cliente.codice_targa ?? "").trim().toUpperCase() || "C000";
  const { data: ordini, error: ordiniErr } = await supabase
    .from("ordini")
    .select("numero_interno, cliente_id")
    .is("deleted_at", null);
  if (ordiniErr) return { success: false, error: ordiniErr.message };
  const seq = prossimoSeqOrdine(ordini ?? [], cliente.id, targa);
  const numeroOrdine = buildNumeroInternoOrdine({
    dataOrdine: data,
    codiceTargaCliente: targa,
    seq,
  });

  let fattura: { numeroFattura: string; numeroInterno: string };
  let proforma: { numeroFattura: string };
  try {
    fattura = await anteprimaNumeroFattura(supabase, data);
    proforma = await anteprimaNumeroProforma(supabase, data);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Numerazione non disponibile.",
    };
  }

  return {
    success: true,
    numerazione: {
      cliente: cliente.ragione_sociale,
      codiceTarga: targa,
      data,
      numeroOrdine,
      numeroFattura: fattura.numeroFattura,
      numeroInternoFattura: fattura.numeroInterno,
      numeroProforma: proforma.numeroFattura,
    },
  };
}

async function chiudiDocumentoProva(
  userId: string,
  ids: { ordineId?: string | null; fatturaId?: string | null; messaggioId?: string | null }
): Promise<string | null> {
  const service = createServiceClient();
  const now = new Date().toISOString();
  const patch = {
    deleted_at: now,
    deleted_by: userId,
    updated_by: userId,
  };
  if (ids.fatturaId) {
    const righe = await service
      .from("fatture_emesse_righe")
      .update({
        deleted_at: now,
        deleted_by: userId,
        updated_by: userId,
      } as never)
      .eq("fattura_id", ids.fatturaId)
      .is("deleted_at", null);
    if (righe.error) return righe.error.message;
    const fattura = await service
      .from("fatture_emesse")
      .update(patch)
      .eq("id", ids.fatturaId)
      .is("deleted_at", null);
    if (fattura.error) return fattura.error.message;
  }
  if (ids.ordineId) {
    const calendario = await service
      .from("produzione_calendario_impegni")
      .update(patch)
      .eq("ordine_id", ids.ordineId)
      .is("deleted_at", null);
    if (calendario.error) return calendario.error.message;
    const schede = await service
      .from("produzione_schede_ordini")
      .update(patch)
      .eq("ordine_id", ids.ordineId)
      .is("deleted_at", null);
    if (schede.error) return schede.error.message;
    const ordine = await service
      .from("ordini")
      .update(patch)
      .eq("id", ids.ordineId)
      .is("deleted_at", null);
    if (ordine.error) return ordine.error.message;
  }
  if (ids.messaggioId) {
    const messaggio = await service
      .from("webmail_messaggi")
      .update(patch)
      .eq("id", ids.messaggioId)
      .is("deleted_at", null);
    if (messaggio.error) return messaggio.error.message;
  }
  return null;
}

function idWebmailDallaNota(note: string | null | undefined): string | null {
  const match = String(note ?? "").match(
    /webmail:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match?.[1] ?? null;
}

export async function statoProvaOrdineAction(): Promise<
  | { success: true; prova: ProvaOrdineAperta | null }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordini")
    .select("id, numero_interno, cliente_ragione_sociale")
    .eq("is_test", true)
    .like("numero_interno", "Or-PROVA/%")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data || !isOrdineProva(data.numero_interno)) {
    return { success: true, prova: null };
  }
  const { data: fattura } = await supabase
    .from("fatture_emesse")
    .select("numero_fattura, note")
    .eq("ordine_id", data.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    success: true,
    prova: {
      ordineId: data.id,
      numeroOrdine: data.numero_interno,
      numeroFattura: String(fattura?.numero_fattura ?? "").trim(),
      email: "",
      cliente: data.cliente_ragione_sociale,
    },
  };
}

export async function annullaProvaOrdineAction(): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const supabase = await createClient();
  const { data: ordini, error } = await supabase
    .from("ordini")
    .select("id, numero_interno")
    .eq("is_test", true)
    .like("numero_interno", "Or-PROVA/%")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const aperti = (ordini ?? []).filter((riga) => isOrdineProva(riga.numero_interno));
  if (aperti.length === 0) {
    return { success: false, error: "Non c'è un ordine di prova da chiudere." };
  }
  for (const ordine of aperti) {
    const { data: fatture } = await supabase
      .from("fatture_emesse")
      .select("id, note, numero_fattura")
      .eq("ordine_id", ordine.id)
      .is("deleted_at", null);
    for (const fattura of fatture ?? []) {
      const chiusuraFattura = await chiudiDocumentoProva(accesso.auth.userId, {
        fatturaId: fattura.id,
        messaggioId: idWebmailDallaNota(fattura.note),
      });
      if (chiusuraFattura) return { success: false, error: chiusuraFattura };
    }
    const chiusuraOrdine = await chiudiDocumentoProva(accesso.auth.userId, {
      ordineId: ordine.id,
    });
    if (chiusuraOrdine) return { success: false, error: chiusuraOrdine };
    await writeAuditLog({
      entity_type: "ordini",
      entity_id: ordine.id,
      action: "prova_ordine_annullata",
      actor_id: accesso.auth.userId,
      summary: `Ordine di prova ${ordine.numero_interno} chiuso senza cancellazione fisica.`,
      payload: {
        numero_ordine: ordine.numero_interno,
        fatture: (fatture ?? []).map((fattura) => fattura.numero_fattura),
        soft_delete: true,
      },
    });
  }
  return { success: true };
}
