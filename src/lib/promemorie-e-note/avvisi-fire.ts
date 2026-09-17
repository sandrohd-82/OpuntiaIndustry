import { notifyPnAvviso } from "@/lib/notifiche/dispatch";
import { createServiceClient } from "@/lib/supabase/server";

export type DueAvvisoRow = {
  id: string;
  origineTipo: "attivita" | "promemoria";
  origineId: string;
  offsetValore: number;
  offsetUnita: string;
  notifyAt: string;
  titolo: string;
  dueAt: string;
  createdBy: string | null;
};

export async function fireDuePnAvvisi(input: {
  actorId: string | null;
  limit?: number;
}): Promise<{ fired: number; pushed: number }> {
  const service = createServiceClient();
  const { data: rows } = await service
    .from("pn_evento_avvisi")
    .select(
      "id, origine_tipo, origine_id, offset_valore, offset_unita, notify_at, created_by, destinatario_id"
    )
    .is("deleted_at", null)
    .is("sent_at", null)
    .lte("notify_at", new Date().toISOString())
    .order("notify_at", { ascending: true })
    .limit(input.limit ?? 80);
  let fired = 0;
  let pushed = 0;
  for (const raw of rows ?? []) {
    const r = raw as Record<string, unknown>;
    const id = String(r.id);
    const origineTipo =
      r.origine_tipo === "promemoria" ? "promemoria" : "attivita";
    const origineId = String(r.origine_id);
    const createdBy = r.created_by ? String(r.created_by) : null;
    const destinatario = r.destinatario_id
      ? String(r.destinatario_id)
      : createdBy;
    const parentTable =
      origineTipo === "attivita" ? "pn_attivita" : "pn_promemoria";
    const { data: parent } = await service
      .from(parentTable)
      .select("id, titolo, due_at, stato, deleted_at")
      .eq("id", origineId)
      .maybeSingle();
    if (!parent || parent.deleted_at) {
      await markAvvisoSent(service, id, input.actorId);
      continue;
    }
    const stato = String(parent.stato ?? "");
    if (
      stato === "completata" ||
      stato === "completato" ||
      stato === "archiviata" ||
      stato === "archiviato"
    ) {
      await markAvvisoSent(service, id, input.actorId);
      continue;
    }
    const claimed = await markAvvisoSent(
      service,
      id,
      input.actorId ?? destinatario
    );
    if (!claimed) continue;
    const recipients = destinatario ? [destinatario] : [];
    if (!recipients.length) {
      fired += 1;
      continue;
    }
    const res = await notifyPnAvviso({
      actorId: input.actorId ?? createdBy ?? recipients[0],
      recipientIds: recipients,
      avvisoId: id,
      origineTipo,
      origineId,
      titolo: String(parent.titolo || "Evento"),
      dueAt: String(parent.due_at),
      offsetValore: Number(r.offset_valore),
      offsetUnita: String(r.offset_unita),
    });
    fired += 1;
    pushed += res.pushed;
  }
  return { fired, pushed };
}

async function markAvvisoSent(
  service: ReturnType<typeof createServiceClient>,
  id: string,
  actorId: string | null
): Promise<boolean> {
  const { data } = await service
    .from("pn_evento_avvisi")
    .update({
      sent_at: new Date().toISOString(),
      sent_by: actorId,
      updated_by: actorId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .is("sent_at", null)
    .select("id")
    .maybeSingle();
  return Boolean(data?.id);
}

export async function listPendingAvvisiForUser(input: {
  userId: string;
}): Promise<DueAvvisoRow[]> {
  const service = createServiceClient();
  const horizon = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
  const { data } = await service
    .from("pn_evento_avvisi")
    .select(
      "id, origine_tipo, origine_id, offset_valore, offset_unita, notify_at, created_by, destinatario_id"
    )
    .eq("destinatario_id", input.userId)
    .is("deleted_at", null)
    .is("sent_at", null)
    .lte("notify_at", horizon)
    .order("notify_at", { ascending: true })
    .limit(80);
  const out: DueAvvisoRow[] = [];
  for (const raw of data ?? []) {
    const r = raw as Record<string, unknown>;
    const origineTipo =
      r.origine_tipo === "promemoria" ? "promemoria" : "attivita";
    const origineId = String(r.origine_id);
    const parentTable =
      origineTipo === "attivita" ? "pn_attivita" : "pn_promemoria";
    const { data: parent } = await service
      .from(parentTable)
      .select("titolo, due_at, stato, deleted_at")
      .eq("id", origineId)
      .maybeSingle();
    if (!parent || parent.deleted_at) continue;
    const stato = String(parent.stato ?? "");
    if (
      stato === "completata" ||
      stato === "completato" ||
      stato === "archiviata" ||
      stato === "archiviato"
    ) {
      continue;
    }
    out.push({
      id: String(r.id),
      origineTipo,
      origineId,
      offsetValore: Number(r.offset_valore),
      offsetUnita: String(r.offset_unita),
      notifyAt: String(r.notify_at),
      titolo: String(parent.titolo || "Evento"),
      dueAt: String(parent.due_at),
      createdBy: r.created_by ? String(r.created_by) : null,
    });
  }
  return out;
}
