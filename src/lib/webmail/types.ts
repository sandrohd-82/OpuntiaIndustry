import { z } from "zod";

export const WEBMAIL_PROVIDERS = ["aruba", "gmail", "generic"] as const;
export type WebmailProvider = (typeof WEBMAIL_PROVIDERS)[number];

export const WEBMAIL_INTENTS = [
  "scheda_tecnica",
  "preventivo_listino",
  "ordine_lotto",
  "generico",
  "da_revisionare",
  "scartate",
] as const;
export type WebmailIntent = (typeof WEBMAIL_INTENTS)[number];

export type WebmailProviderPreset = {
  provider: WebmailProvider;
  label: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  docsHint: string;
};

export const WEBMAIL_PROVIDER_PRESETS: Record<
  WebmailProvider,
  WebmailProviderPreset
> = {
  aruba: {
    provider: "aruba",
    label: "Aruba PEC / Email",
    imapHost: "imaps.aruba.it",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtps.aruba.it",
    smtpPort: 465,
    smtpSecure: true,
    docsHint: "Usa la password della casella (non OTP). Vedi docs/WEBMAIL-COLLEGAMENTO-GMAIL-ARUBA.md",
  },
  gmail: {
    provider: "gmail",
    label: "Gmail (Google Workspace / personale)",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    docsHint:
      "Obbligatoria App Password Google (verifica in 2 passaggi attiva). Vedi docs/WEBMAIL-COLLEGAMENTO-GMAIL-ARUBA.md",
  },
  generic: {
    provider: "generic",
    label: "IMAP/SMTP generico",
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    docsHint: "Inserisci host/porte del provider.",
  },
};

export const webmailAccountInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(2).max(120),
    emailAddress: z.string().trim().email(),
    provider: z.enum(WEBMAIL_PROVIDERS),
    imapHost: z.string().trim().min(1),
    imapPort: z.number().int().min(1).max(65535),
    imapSecure: z.boolean(),
    smtpHost: z.string().trim().min(1),
    smtpPort: z.number().int().min(1).max(65535),
    smtpSecure: z.boolean(),
    username: z.string().trim().min(1),
    /** Obbligatoria in creazione; in modifica lascia vuota per non cambiare. */
    password: z.string().optional(),
    syncEnabled: z.boolean().optional(),
    ownerUserId: z.string().uuid().optional().nullable(),
    /** Profili collegati alla casella (almeno uno in creazione/modifica admin). */
    grantedUserIds: z.array(z.string().uuid()).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.id && (!val.password || val.password.length < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password obbligatoria per una nuova casella.",
      });
    }
    if (val.grantedUserIds && val.grantedUserIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["grantedUserIds"],
        message: "Seleziona almeno un profilo.",
      });
    }
  });

export type WebmailAccountInput = z.infer<typeof webmailAccountInputSchema>;

export type WebmailCategoria = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  colore: string;
  isSystem: boolean;
  sortOrder: number;
};

export type WebmailAccountPublic = {
  id: string;
  label: string;
  emailAddress: string;
  provider: WebmailProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  ownerUserId: string | null;
};

export type WebmailMessaggio = {
  id: string;
  accountId: string;
  categoriaId: string | null;
  direction: "inbound" | "outbound";
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: string | null;
  isSeen: boolean;
  aiIntent: WebmailIntent | null;
  aiConfidence: number | null;
  hasAiDraft: boolean;
  aziendaTipo: "cliente" | "fornitore" | "cliente_possibile" | null;
  aziendaId: string | null;
  aziendaLabel: string;
  contattoId: string | null;
  linkStato: "bozza" | "collegata" | "da_salvare";
};

export type WebmailBozzaAi = {
  id: string;
  messaggioId: string;
  documentoStato: "bozza" | "approvata" | "inviata" | "scartata";
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  intent: string;
  confidence: number | null;
  ragNotes: string;
  aiGenerated: boolean;
  approvedBy: string | null;
  sentAt: string | null;
  allegati: Array<{
    id: string;
    fileName: string;
    storagePath: string;
    source: string;
    prodottoId: string | null;
  }>;
};

export const updateBozzaSchema = z.object({
  bozzaId: z.string().uuid(),
  subject: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().min(1).max(50000),
  bodyHtml: z.string().trim().max(100000).optional(),
});

export const sendBozzaSchema = z.object({
  bozzaId: z.string().uuid(),
});
