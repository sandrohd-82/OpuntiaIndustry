import { writeAuditLog } from "@/lib/audit";
import {
  createNotificaSchema,
  NOTIFICA_TIPO_TITLES,
  type CreateNotificaInput,
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
  input: CreateNotificaInput & { actorId: string; includeActor?: boolean }
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
    ...new Set(
      parsed.data.recipientIds.filter(
        (id) => input.includeActor || id !== input.actorId
      )
    ),
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

  let error = service
    ? (await service.from("app_notifiche").insert(rows)).error
    : (await user.from("app_notifiche").insert(rows)).error;
  if (error && service) {
    console.error("[app_notifiche insert service]", error.message);
    error = (await user.from("app_notifiche").insert(rows)).error;
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

export async function notifyPnCoinvolti(input: {
  actorId: string;
  actorName: string;
  recipientIds: string[];
  kind: "attivita" | "promemoria";
  entityId: string;
  titolo: string;
  nuova: boolean;
}): Promise<void> {
  try {
    const isAtt = input.kind === "attivita";
    await dispatchNotifiche({
      actorId: input.actorId,
      recipientIds: input.recipientIds,
      tipo: "attivita",
      title: input.nuova
        ? isAtt
          ? "Nuova attività"
          : "Nuovo promemoria"
        : isAtt
          ? "Attività aggiornata"
          : "Promemoria aggiornato",
      body: `${input.actorName} ti ha coinvolto in «${input.titolo}»`,
      href: isAtt
        ? "/app/promemorie-e-note/attivita/elenco"
        : "/app/promemorie-e-note/promemoria/elenco",
      entityType: isAtt ? "pn_attivita" : "pn_promemoria",
      entityId: input.entityId,
      payload: { titolo: input.titolo, kind: input.kind },
    });
  } catch (err) {
    console.error("[notifyPnCoinvolti]", err);
  }
}

export async function notifyAttivitaCoinvolti(input: {
  actorId: string;
  actorName: string;
  recipientIds: string[];
  attivitaId: string;
  titolo: string;
  nuova: boolean;
}): Promise<void> {
  await notifyPnCoinvolti({
    actorId: input.actorId,
    actorName: input.actorName,
    recipientIds: input.recipientIds,
    kind: "attivita",
    entityId: input.attivitaId,
    titolo: input.titolo,
    nuova: input.nuova,
  });
}

export async function notifyPnAvviso(input: {
  actorId: string;
  recipientIds: string[];
  avvisoId: string;
  origineTipo: "attivita" | "promemoria";
  origineId: string;
  titolo: string;
  dueAt: string;
  offsetValore: number;
  offsetUnita: string;
}): Promise<{ created: number; pushed: number }> {
  const href =
    input.origineTipo === "attivita"
      ? "/app/promemorie-e-note/attivita/elenco"
      : "/app/promemorie-e-note/promemoria/elenco";
  const unita = input.offsetUnita;
  try {
    return await dispatchNotifiche({
      actorId: input.actorId,
      includeActor: true,
      recipientIds: input.recipientIds,
      tipo: "avviso",
      title: "Sveglia",
      body: `Avvisami ${input.offsetValore} ${unita} prima: «${input.titolo}»`,
      href,
      entityType: "pn_evento_avvisi",
      entityId: input.avvisoId,
      payload: {
        origineTipo: input.origineTipo,
        origineId: input.origineId,
        titolo: input.titolo,
        dueAt: input.dueAt,
        offsetValore: input.offsetValore,
        offsetUnita: input.offsetUnita,
      },
    });
  } catch (err) {
    console.error("[notifyPnAvviso]", err);
    return { created: 0, pushed: 0 };
  }
}
