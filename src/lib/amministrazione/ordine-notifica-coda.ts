import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { ORDINI_STATI_DA_PROCESSARE } from "@/lib/amministrazione/ordini";
import { loadClienteCommercialeId } from "@/lib/amministrazione/sconto-fuori-listino-server";
import { createServiceClient } from "@/lib/supabase/server";
import type { OrdineStato } from "@/types/database";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function inCoda(stato: string): boolean {
  return (ORDINI_STATI_DA_PROCESSARE as readonly string[]).includes(stato);
}

async function commercialePossibile(
  possibileId: string | null | undefined
): Promise<string | null> {
  const id = String(possibileId ?? "").trim();
  if (!UUID.test(id)) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("clienti_possibili")
    .select("commerciale_id")
    .eq("id", id)
    .maybeSingle();
  const cid = String(
    (data as { commerciale_id?: string | null } | null)?.commerciale_id ?? ""
  ).trim();
  return UUID.test(cid) ? cid : null;
}

/** Creatore dell'ordine e, se diverso, il commerciale dell'azienda. */
export async function destinatariOrdineCreatoreOCommerciale(input: {
  createdBy: string | null | undefined;
  clienteId: string | null | undefined;
  possibileClienteId?: string | null;
}): Promise<string[]> {
  const ids = new Set<string>();
  const created = String(input.createdBy ?? "").trim();
  if (UUID.test(created)) ids.add(created);
  const commerciale =
    (await loadClienteCommercialeId(input.clienteId)) ||
    (await commercialePossibile(input.possibileClienteId));
  if (commerciale && UUID.test(commerciale)) ids.add(commerciale);
  return [...ids];
}

/**
 * Avvisa creatore e commerciale quando un ordine ancora da processare
 * viene modificato o cambia stato (es. messo in scaletta).
 * Lo stato va passato com'era prima della scrittura.
 */
export async function notificaOrdineInCoda(input: {
  actorId: string;
  ordineId: string;
  statoPrima: string;
  evento: string;
  title?: string;
}): Promise<void> {
  if (!inCoda(input.statoPrima)) return;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("ordini")
      .select(
        "numero_interno, cliente_ragione_sociale, cliente_id, cliente_possibile_id, created_by"
      )
      .eq("id", input.ordineId)
      .maybeSingle();
    const row = data as {
      numero_interno?: string;
      cliente_ragione_sociale?: string;
      cliente_id?: string | null;
      cliente_possibile_id?: string | null;
      created_by?: string | null;
    } | null;
    if (!row) return;
    const recipients = await destinatariOrdineCreatoreOCommerciale({
      createdBy: row.created_by,
      clienteId: row.cliente_id,
      possibileClienteId: row.cliente_possibile_id,
    });
    if (!recipients.length) return;
    const numero = String(row.numero_interno ?? "").trim() || "ordine";
    const cliente = String(row.cliente_ragione_sociale ?? "").trim();
    const evento = input.evento.trim() || "modificato";
    await dispatchNotifiche({
      actorId: input.actorId,
      recipientIds: recipients,
      allowRepeat: true,
      tipo: "sistema",
      title: input.title?.trim() || "Ordine aggiornato",
      body: cliente
        ? `Ordine ${numero} per ${cliente}: ${evento}.`
        : `Ordine ${numero}: ${evento}.`,
      href: "/app/amministrazione/ordini/elenco",
      entityType: "ordini",
      entityId: input.ordineId,
      payload: { stato_prima: input.statoPrima as OrdineStato, evento },
    });
  } catch (err) {
    console.error("[notificaOrdineInCoda]", err);
  }
}
