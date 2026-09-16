import { writeAuditLog } from "@/lib/audit";
import {
  createNotificaSchema,
  NOTIFICA_TIPO_TITLES,
  type CreateNotificaInput,
  type NotificaTipo,
} from "@/lib/notifiche/types";
import { sendWebPushToUsers } from "@/lib/notifiche/web-push";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function notificheWriteClient(): Promise<{
  user: Awaited<ReturnType<typeof createClient>>;
  service: ReturnType<typeof createServiceClient> | null;
}> {
  const user = await createClient();
  try {
    return { user, service: createServiceClient() };
  } catch (err) {
    console.error("[dispatchNotifiche] service client", err);
    return { user, service: null };
  }
}

export async function dispatchNotifiche(
  input: CreateNotificaInput & { actorId: string }
): Promise<{ created: number; pushed: number }> {
  const parsed = createNotificaSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      "[dispatchNotifiche] zod",
      parsed.error.issues.map((i) => i.message).join("; ")
    );
    return { created: 0, pushed: 0 };
  }
  const recipients = [
    ...new Set(parsed.data.recipientIds.filter((id) => id !== input.actorId)),
  ];
  if (!recipients.length) return { created: 0, pushed: 0 };

  const { user, service } = await notificheWriteClient();
  const reader = service ?? user;
  let existing = new Set<string>();
  if (parsed.data.entityId) {
    const { data } = await reader
      .from("app_notifiche")
      .select("recipient_id")
      .eq("tipo", parsed.data.tipo)
      .eq("entity_id", parsed.data.entityId)
      .in("recipient_id", recipients)
      .is("deleted_at", null)
      .is("read_at", null);
    existing = new Set((data ?? []).map((r) => String(r.recipient_id)));
  }
  const toInsert = recipients.filter((id) => !existing.has(id));
  if (!toInsert.length) return { created: 0, pushed: 0 };

  const title = parsed.data.title || NOTIFICA_TIPO_TITLES[parsed.data.tipo];
  const rows = toInsert.map((recipient_id) => ({
    recipient_id,
    actor_id: input.actorId,
    tipo: parsed.data.tipo,
    title,
    body: parsed.data.body ?? "",
    href: parsed.data.href,
    entity_type: parsed.data.entityType ?? null,
    entity_id: parsed.data.entityId ?? null,
    payload: parsed.data.payload ?? {},
    created_by: input.actorId,
    updated_by: input.actorId,
  }));

  let error = (await user.from("app_notifiche").insert(rows)).error;
  if (error && service) {
    console.error("[app_notifiche insert user]", error.message);
    error = (await service.from("app_notifiche").insert(rows)).error;
  }
  if (error) {
    console.error("[app_notifiche insert]", error.message);
    return { created: 0, pushed: 0 };
  }

  await writeAuditLog({
    entity_type: "app_notifiche",
    entity_id: parsed.data.entityId ?? toInsert[0],
    action: "notifica",
    actor_id: input.actorId,
    summary: `Notifica ${parsed.data.tipo}: ${title} → ${toInsert.length} operatori`,
    payload: {
      tipo: parsed.data.tipo,
      recipient_ids: toInsert,
      href: parsed.data.href,
    },
  });

  const pushed = await sendWebPushToUsers(toInsert, {
    tipo: parsed.data.tipo,
    title,
    body: parsed.data.body ?? "",
    href: parsed.data.href,
    entityId: parsed.data.entityId,
  });
  return { created: toInsert.length, pushed };
}

export async function notifyAttivitaCoinvolti(input: {
  actorId: string;
  actorName: string;
  recipientIds: string[];
  attivitaId: string;
  titolo: string;
  nuova: boolean;
}): Promise<void> {
  try {
  const tipo: NotificaTipo = "attivita";
  await dispatchNotifiche({
    actorId: input.actorId,
    recipientIds: input.recipientIds,
    tipo,
    title: input.nuova ? "Nuova attività" : "Attività aggiornata",
    body: `${input.actorName} ti ha coinvolto in «${input.titolo}»`,
    href: "/app/promemorie-e-note/attivita/elenco",
    entityType: "pn_attivita",
    entityId: input.attivitaId,
    payload: { titolo: input.titolo },
  });
  } catch (err) {
    console.error("[notifyAttivitaCoinvolti]", err);
  }
}
