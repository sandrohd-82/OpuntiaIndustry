import { writeAuditLog } from "@/lib/audit";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export const GIORNI_ELENCO_DOPO_PARTENZA = 30;

/** Prima lavorazione o trasformazione: da In scaletta a In produzione. Non torna indietro. */
export async function segnaInProduzioneSeInScaletta(input: {
  supabase: Db;
  ordineId?: string | null;
  campionaturaId?: string | null;
  userId: string;
}): Promise<void> {
  const table = input.ordineId ? "ordini" : "campionature";
  const id = input.ordineId || input.campionaturaId;
  if (!id) return;
  const { data } = await input.supabase
    .from(table)
    .select("stato, numero_interno")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const stato = String(data?.stato ?? "");
  const inScaletta =
    (table === "ordini" && stato === "in_scaletta") ||
    (table === "campionature" && stato === "processata");
  if (!inScaletta) return;
  const { error } = await input.supabase
    .from(table)
    .update({ stato: "in_produzione", updated_by: input.userId })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return;
  const numero = String(data?.numero_interno ?? id);
  await writeAuditLog({
    entity_type: table,
    entity_id: id,
    action: "status_change",
    actor_id: input.userId,
    summary: `${numero}: In scaletta → In produzione`,
    payload: { stato_da: stato, stato_a: "in_produzione" },
  });
}

/** Partito da almeno 30 giorni: archivio, senza cancellare il documento. */
export async function archiviaPartitiScaduti(): Promise<{
  ordini: number;
  campionature: number;
}> {
  const service = createServiceClient();
  const limite = new Date(
    Date.now() - GIORNI_ELENCO_DOPO_PARTENZA * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: ordini } = await service
    .from("ordini")
    .select("id, numero_interno, stato")
    .in("stato", ["inviato", "evaso"])
    .lt("ritiro_at", limite)
    .is("deleted_at", null)
    .limit(200);

  let nOrd = 0;
  for (const row of ordini ?? []) {
    const { error } = await service
      .from("ordini")
      .update({
        stato: "storico",
        origine_storico: "chiusura",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .in("stato", ["inviato", "evaso"])
      .is("deleted_at", null);
    if (error) continue;
    nOrd += 1;
    await service.from("audit_log").insert({
      entity_type: "ordini",
      entity_id: row.id,
      action: "status_change",
      summary: `${row.numero_interno}: Partito da più di ${GIORNI_ELENCO_DOPO_PARTENZA} giorni, passato in archivio`,
      payload: {
        stato_da: row.stato,
        stato_a: "storico",
        giorni: GIORNI_ELENCO_DOPO_PARTENZA,
      },
    });
  }

  const { data: camps } = await service
    .from("campionature")
    .select("id, numero_interno, stato")
    .in("stato", ["inviata", "consegnata"])
    .lt("ritiro_at", limite)
    .is("deleted_at", null)
    .limit(200);

  let nCamp = 0;
  for (const row of camps ?? []) {
    const { error } = await service
      .from("campionature")
      .update({
        stato: "archiviata",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .in("stato", ["inviata", "consegnata"])
      .is("deleted_at", null);
    if (error) continue;
    nCamp += 1;
    await service.from("audit_log").insert({
      entity_type: "campionature",
      entity_id: row.id,
      action: "status_change",
      summary: `${row.numero_interno}: Partito da più di ${GIORNI_ELENCO_DOPO_PARTENZA} giorni, passato in archivio`,
      payload: {
        stato_da: row.stato,
        stato_a: "archiviata",
        giorni: GIORNI_ELENCO_DOPO_PARTENZA,
      },
    });
  }

  return { ordini: nOrd, campionature: nCamp };
}
