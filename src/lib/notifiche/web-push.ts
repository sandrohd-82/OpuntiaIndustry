import webpush from "web-push";
import { getVapidPublicKey } from "@/lib/notifiche/vapid-env";
import { createServiceClient } from "@/lib/supabase/server";
import type { NotificaTipo } from "@/lib/notifiche/types";

export { getVapidPublicKey } from "@/lib/notifiche/vapid-env";

export type PushPayload = {
  tipo: NotificaTipo;
  title: string;
  body: string;
  href: string;
  entityId?: string;
  tag?: string;
};

function vapidReady(): boolean {
  return Boolean(getVapidPublicKey() && process.env.VAPID_PRIVATE_KEY);
}

function configureVapid() {
  const publicKey = getVapidPublicKey();
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@opuntiaindustry.com",
    publicKey,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function sendWebPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  if (!vapidReady() || userIds.length === 0) return 0;
  configureVapid();
  const service = createServiceClient();
  const { data: rows } = await service
    .from("app_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds)
    .is("deleted_at", null);
  if (!rows?.length) return 0;

  const body = JSON.stringify({
    tipo: payload.tipo,
    title: payload.title,
    body: payload.body,
    href: payload.href,
    entityId: payload.entityId ?? "",
    tag: payload.tag ?? `oi-${payload.tipo}-${payload.entityId ?? "x"}`,
  });

  let sent = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: String(row.endpoint),
          keys: {
            p256dh: String(row.p256dh),
            auth: String(row.auth),
          },
        },
        body
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await service
          .from("app_push_subscriptions")
          .update({ deleted_at: now, deleted_by: null, updated_by: null })
          .eq("id", row.id)
          .is("deleted_at", null);
      } else {
        console.error("[web-push]", err);
      }
    }
  }
  return sent;
}
