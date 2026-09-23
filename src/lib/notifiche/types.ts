import { z } from "zod";

export const NOTIFICA_TIPI = [
  "attivita",
  "webmail",
  "sistema",
  "chat",
  "scadenza",
  "avviso",
  "sicurezza",
] as const;

export type NotificaTipo = (typeof NOTIFICA_TIPI)[number];

export const NOTIFICA_TIPO_LABELS: Record<NotificaTipo, string> = {
  attivita: "Attività",
  webmail: "Nuova mail ricevuta",
  sistema: "Notifiche di sistema",
  chat: "Chat",
  scadenza: "Scadenze",
  avviso: "Sveglia",
  sicurezza: "Sicurezza",
};

export const NOTIFICA_TIPO_TITLES: Record<NotificaTipo, string> = {
  attivita: "Nuova attività",
  webmail: "Nuova mail ricevuta",
  sistema: "Notifica di sistema",
  chat: "Nuovo messaggio in Chat",
  scadenza: "Scadenza",
  avviso: "Sveglia",
  sicurezza: "Richiesta reset password",
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

/** Solo path interni /app/… — fallback per tipo se href assente o non valido. */
export function hrefAreaNotifica(n: {
  tipo: string;
  href?: string | null;
}): string {
  const raw = String(n.href ?? "").trim();
  const isAppPath =
    raw.startsWith("/app/") && !raw.startsWith("//") && !raw.includes("://");
  const isGenericInbox = raw === "/app/notifiche" || raw.startsWith("/app/notifiche?");
  if (isAppPath && !(isGenericInbox && n.tipo !== "sicurezza")) {
    return raw;
  }
  switch (n.tipo) {
    case "attivita":
      return "/app/promemorie-e-note/attivita/elenco";
    case "avviso":
      return "/app/promemorie-e-note";
    case "webmail":
      return "/app/webmail";
    case "chat":
      return "/app/chat";
    case "scadenza":
      return "/app/amministrazione";
    case "sicurezza":
      return "/app/notifiche";
    case "sistema":
      return "/app/strumenti";
    default:
      return "/app/notifiche";
  }
}
