import { dispatchNotifiche } from "@/lib/notifiche/dispatch";

export async function notificaSchedaRilevata(input: {
  userId: string;
  bacheca: string;
  titolo: string;
  href: string;
  entityId?: string;
  suTrello: boolean;
}): Promise<void> {
  const bacheca = input.bacheca.trim() || "Bacheca";
  const titolo = input.titolo.trim() || "Scheda";
  await dispatchNotifiche({
    actorId: input.userId,
    recipientIds: [input.userId],
    includeActor: true,
    tipo: "sistema",
    title: "Rilevata",
    body: input.suTrello
      ? `Nuova scheda su Trello · ${bacheca} · ${titolo}`
      : `Nuova scheda · ${bacheca} · ${titolo}`,
    href: input.href,
    entityType: input.entityId ? "kb_schede" : undefined,
    entityId: input.entityId,
    payload: {},
  });
}
