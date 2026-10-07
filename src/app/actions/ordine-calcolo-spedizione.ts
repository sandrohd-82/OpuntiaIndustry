"use server";

import { z } from "zod";
import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { BLOCCO_DOCUMENTI_CLIENTE_ORDINE } from "@/lib/amministrazione/ordine-calcolo-spedizione";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const COMPLETA_MSG =
  "Costo registrato. Nessuna fattura è stata inviata.";

async function gateLettura() {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { ok: false as const, error: "Non autenticato" };
  }
  if (isSuperadminProfile(auth.profile)) return { ok: true as const, auth };
  const ok =
    userCanAccessArea(auth.areas, "amministrazione") ||
    userCanAccessArea(auth.areas, "commerciale") ||
    userCanAccessArea(auth.areas, "produzione");
  if (!ok) return { ok: false as const, error: "Permesso negato" };
  return { ok: true as const, auth };
}

export async function elencoProfiliCalcoloSpedizioni(): Promise<string[]> {
  const supabase = await createClient();
  const { data: compito } = await supabase
    .from("compiti_adempimenti")
    .select("id")
    .eq("codice", "calcolo_spedizioni")
    .eq("attivo", true)
    .is("deleted_at", null)
    .maybeSingle();
  const compitoId = (compito as { id?: string } | null)?.id;
  if (!compitoId) return [];
  const { data: persone } = await supabase
    .from("compiti_adempimenti_persone")
    .select("profile_id")
    .eq("compito_id", compitoId)
    .is("deleted_at", null);
  return [
    ...new Set(
      ((persone ?? []) as Array<{ profile_id: string }>).map((p) => p.profile_id)
    ),
  ];
}

/** Fail-closed: se non si legge l'ordine, nessun documento parte. */
export async function motivoBloccoInvioClienteOrdine(
  ordineId: string | null | undefined
): Promise<string | null> {
  const id = String(ordineId ?? "").trim();
  if (!id) return null;
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("ordini")
      .select("modalita_spedizione_prezzo, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return BLOCCO_DOCUMENTI_CLIENTE_ORDINE;
    if (!data || (data as { deleted_at?: string | null }).deleted_at) return null;
    if (
      (data as { modalita_spedizione_prezzo?: string }).modalita_spedizione_prezzo ===
      "richiesto"
    ) {
      return BLOCCO_DOCUMENTI_CLIENTE_ORDINE;
    }
    return null;
  } catch {
    return BLOCCO_DOCUMENTI_CLIENTE_ORDINE;
  }
}

export type OrdineInAttesaCalcolo = {
  id: string;
  numeroInterno: string;
  cliente: string;
  destinatario: string;
  indirizzoSpedizione: string;
  prodotto: string;
};

export async function listOrdiniInAttesaCalcoloSpedizioneAction(): Promise<
  | { success: true; items: OrdineInAttesaCalcolo[] }
  | { success: false; error: string }
> {
  const gate = await gateLettura();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordini")
    .select(
      "id, numero_interno, cliente_ragione_sociale, destinatario, indirizzo_spedizione"
    )
    .eq("modalita_spedizione_prezzo", "richiesto")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as Array<{
    id: string;
    numero_interno: string;
    cliente_ragione_sociale: string;
    destinatario: string | null;
    indirizzo_spedizione: string | null;
  }>;
  const ids = rows.map((r) => r.id);
  const prodotti = new Map<string, string>();
  if (ids.length) {
    const { data: righe } = await supabase
      .from("ordini_righe")
      .select("ordine_id, prodotto_codice, prodotto_nome, quantita, unita_misura, sort_order")
      .in("ordine_id", ids)
      .order("sort_order", { ascending: true });
    for (const riga of righe ?? []) {
      const ordineId = String((riga as { ordine_id: string }).ordine_id);
      if (prodotti.has(ordineId)) continue;
      const codice = String((riga as { prodotto_codice?: string }).prodotto_codice ?? "");
      const nome = String((riga as { prodotto_nome?: string }).prodotto_nome ?? "");
      const qta = Number((riga as { quantita?: number }).quantita ?? 0);
      const um = String((riga as { unita_misura?: string }).unita_misura ?? "");
      prodotti.set(ordineId, `${codice} ${nome} · ${qta} ${um}`.trim());
    }
  }
  return {
    success: true,
    items: rows.map((row) => ({
      id: row.id,
      numeroInterno: row.numero_interno,
      cliente: row.cliente_ragione_sociale,
      destinatario: String(row.destinatario ?? ""),
      indirizzoSpedizione: String(row.indirizzo_spedizione ?? ""),
      prodotto: prodotti.get(row.id) ?? "",
    })),
  };
}

const completaSchema = z.object({
  ordineId: z.string().uuid(),
  importo: z.number().positive("Inserisci il costo della spedizione."),
  ivaModo: z.enum(["compreso", "piu_iva"]),
  confermaCosto: z.literal(true),
});

export async function completaCalcoloSpedizioneOrdineAction(
  raw: unknown
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  const gate = await gateLettura();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = completaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  const incaricati = await elencoProfiliCalcoloSpedizioni();
  const autorizzato =
    isSuperadminProfile(gate.auth.profile) || incaricati.includes(gate.auth.userId);
  if (!autorizzato) {
    return {
      success: false,
      error: "Solo chi è assegnato a Calcolo spedizioni può confermare il costo.",
    };
  }
  const importo = Math.round(input.importo * 100) / 100;
  if (!(importo > 0)) {
    return { success: false, error: "Inserisci il costo della spedizione." };
  }
  const now = new Date().toISOString();
  const service = createServiceClient();
  const { data, error } = await service
    .from("ordini")
    .update({
      modalita_spedizione_prezzo: "inserito",
      spedizione_importo: importo,
      spedizione_iva_modo: input.ivaModo,
      trasporto_imponibile: importo,
      trasporto_iva_percentuale: input.ivaModo === "compreso" ? 0 : 22,
      spedizione_calcolata_at: now,
      spedizione_calcolata_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .eq("id", input.ordineId)
    .eq("modalita_spedizione_prezzo", "richiesto")
    .is("deleted_at", null)
    .select("id, numero_interno, created_by, cliente_ragione_sociale")
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return {
      success: false,
      error: "Questo ordine non è più in attesa del calcolo spedizione.",
    };
  }
  const row = data as {
    id: string;
    numero_interno: string;
    created_by: string | null;
    cliente_ragione_sociale: string;
  };
  await service.from("audit_log").insert({
    entity_type: "ordini",
    entity_id: row.id,
    action: "update",
    actor_id: gate.auth.userId,
    summary: `Costo spedizione ${importo} € confermato sull'ordine ${row.numero_interno}. La fattura si crea e non si invia.`,
    payload: {
      modalita_spedizione_prezzo: "inserito",
      spedizione_importo: importo,
      spedizione_iva_modo: input.ivaModo,
      invio_cliente: false,
    },
  });
  if (row.created_by) {
    await dispatchNotifiche({
      actorId: gate.auth.userId,
      recipientIds: [row.created_by],
      tipo: "attivita",
      title: "Costo spedizione inserito",
      body: `Ordine ${row.numero_interno} per ${row.cliente_ragione_sociale}: il costo è ${importo} €. La fattura viene creata e non viene inviata.`,
      href: "/app/amministrazione/ordini",
      entityType: "ordini",
      entityId: row.id,
      payload: { compito: "calcolo_spedizioni", invio_cliente: false },
    });
  }
  return { success: true, message: COMPLETA_MSG };
}
