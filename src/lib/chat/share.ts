import { z } from "zod";

export type ChatShareActionId =
  | "gallery"
  | "doc"
  | "camera"
  | "location"
  | "contact_device"
  | "contact_gestionale"
  | "poll"
  | "scheda";

export type ChatShareAction = {
  id: ChatShareActionId;
  label: string;
  description: string;
  /** Se false, voce spenta (visibile ma non cliccabile). */
  allowed: boolean;
  adminOnly: boolean;
};

/** Permessi menu Condividi: admin/superadmin sbloccano gestionale + scheda. */
export function buildChatShareActions(isAdmin: boolean): ChatShareAction[] {
  return [
    {
      id: "gallery",
      label: "Gallery",
      description: "Immagini e video",
      allowed: true,
      adminOnly: false,
    },
    {
      id: "doc",
      label: "Documenti",
      description: "PDF, DOC, fogli…",
      allowed: true,
      adminOnly: false,
    },
    {
      id: "camera",
      label: "Fotocamera",
      description: "Scatta o registra",
      allowed: true,
      adminOnly: false,
    },
    {
      id: "location",
      label: "Posizione",
      description: "Attuale o cerca sulla mappa",
      allowed: true,
      adminOnly: false,
    },
    {
      id: "contact_device",
      label: "Contatto dispositivo",
      description: "Dalla rubrica del telefono",
      allowed: true,
      adminOnly: false,
    },
    {
      id: "contact_gestionale",
      label: "Contatto gestionale",
      description: "Dalla rubrica Opuntia",
      allowed: isAdmin,
      adminOnly: true,
    },
    {
      id: "poll",
      label: "Sondaggio",
      description: "Titolo e risposte, un voto a testa",
      allowed: true,
      adminOnly: false,
    },
    {
      id: "scheda",
      label: "Scheda",
      description: "Clienti, fornitori, prodotti…",
      allowed: isAdmin,
      adminOnly: true,
    },
  ];
}

export const locationPayloadSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().trim().min(1).max(300),
  source: z.enum(["attuale", "cerca"]),
});

export const contactPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().max(120).optional().default(""),
  source: z.enum(["device", "gestionale"]),
  rubricaId: z.string().uuid().optional().nullable(),
});

export const schedaPayloadSchema = z.object({
  entityType: z.enum([
    "cliente",
    "possibile_cliente",
    "fornitore",
    "prodotto",
    "prodotto_agri",
    "materia_prima",
  ]),
  entityId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).optional().default(""),
});

export const pollCreateSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
    titolo: z.string().trim().min(1).max(200),
    options: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(12),
  })
  .superRefine((v, ctx) => {
    const hasConv = Boolean(v.conversationId);
    const hasTopic = Boolean(v.topicId);
    if (hasConv === hasTopic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Specificare conversationId oppure topicId.",
      });
    }
  });

export type LocationPayload = z.infer<typeof locationPayloadSchema>;
export type ContactPayload = z.infer<typeof contactPayloadSchema>;
export type SchedaPayload = z.infer<typeof schedaPayloadSchema>;

export type ChatMessageKind =
  | "text"
  | "audio"
  | "file"
  | "location"
  | "contact"
  | "poll"
  | "scheda";
