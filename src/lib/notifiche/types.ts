import { z } from "zod";

export const NOTIFICA_TIPI = [
  "attivita",
  "webmail",
  "sistema",
  "chat",
  "scadenza",
  "avviso",
] as const;

export type NotificaTipo = (typeof NOTIFICA_TIPI)[number];

export const NOTIFICA_TIPO_LABELS: Record<NotificaTipo, string> = {
  attivita: "Attività",
  webmail: "Nuova mail ricevuta",
  sistema: "Notifiche di sistema",
  chat: "Chat",
  scadenza: "Scadenze",
  avviso: "Sveglia",
};

export const NOTIFICA_TIPO_TITLES: Record<NotificaTipo, string> = {
  attivita: "Nuova attività",
  webmail: "Nuova mail ricevuta",
  sistema: "Notifica di sistema",
  chat: "Nuovo messaggio in Chat",
  scadenza: "Scadenza",
  avviso: "Sveglia",
};

export const createNotificaSchema = z.object({
  recipientIds: z.array(z.string().uuid()).min(1).max(80),
  tipo: z.enum(NOTIFICA_TIPI),
  title: z.string().trim().min(1).max(180),
  body: z.string().max(2000).optional().default(""),
  href: z
    .string()
    .regex(/^\/(?!\/)/)
    .max(400),
  entityType: z.string().max(80).optional(),
  entityId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreateNotificaInput = z.infer<typeof createNotificaSchema>;
