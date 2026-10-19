import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { createServiceClient } from "@/lib/supabase/server";

export async function fireDueKanbanPromemoria(input: {
  actorId: string | null;
  limit?: number;
}): Promise<{ fired: number; pushed: number }> {
  const service = createServiceClient();
  const { data: rows } = await service
    .from("kb_promemoria")
    .select("id, scheda_id, destinatario_id, created_by")
    .is("deleted_at", null)
    .is("sent_at", null)
    .lte("notify_at", new Date().toISOString())
    .order("notify_at", { ascending: true })
    .limit(input.limit ?? 80);
  let fired = 0;
  let pushed = 0;
  for (const raw of rows ?? []) {
    const id = String(raw.id);
    const schedaId = String(raw.scheda_id);
    const destinatario = raw.destinatario_id
      ? String(raw.destinatario_id)
      : raw.created_by
        ? String(raw.created_by)
        : "";
    const { data: scheda } = await service
      .from("kb_schede")
      .select("id, titolo, bacheca_id, archived_at, purged_at, deleted_at, scadenza_completata")
      .eq("id", schedaId)
      .maybeSingle();
    const chiusa =
      !scheda ||
      scheda.deleted_at ||
      scheda.purged_at ||
      scheda.archived_at ||
      scheda.scadenza_completata;
    const claimed = await service
      .from("kb_promemoria")
      .update({
        sent_at: new Date().toISOString(),
        updated_by: input.actorId,
      })
      .eq("id", id)
      .is("sent_at", null);
    if (claimed.error || chiusa || !destinatario) {
      fired += 1;
      continue;
    }
    const res = await dispatchNotifiche({
      actorId: input.actorId ?? destinatario,
      recipientIds: [destinatario],
      tipo: "scadenza",
      title: `Scadenza: ${String(scheda.titolo || "Scheda")}`,
      body: "Promemoria della bacheca.",
      href: `/app/promemorie-e-note/bacheche/${scheda.bacheca_id}?scheda=${schedaId}`,
      entityType: "kb_schede",
      entityId: schedaId,
      payload: {},
      includeActor: true,
    });
    fired += 1;
    pushed += res.pushed;
  }
  return { fired, pushed };
}
