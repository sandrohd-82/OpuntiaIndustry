import { z } from "zod";

export const REGISTRO_ACCESSI_EVENTI = [
  "login",
  "login_fallito",
  "2fa_ok",
  "2fa_fallito",
  "logout",
] as const;
export type RegistroAccessoEvento = (typeof REGISTRO_ACCESSI_EVENTI)[number];

export const REGISTRO_ACCESSI_ESITI = ["successo", "fallito"] as const;
export type RegistroAccessoEsito = (typeof REGISTRO_ACCESSI_ESITI)[number];

export type RegistroAccessoMetodo2fa = "email" | "app";

export type RegistroAccesso = {
  id: string;
  userId: string | null;
  email: string;
  nome: string;
  evento: RegistroAccessoEvento;
  esito: RegistroAccessoEsito;
  occurredAt: string;
  ip: string | null;
  userAgent: string | null;
  metodo2fa: RegistroAccessoMetodo2fa | null;
  note: string;
  createdAt: string;
  createdBy: string | null;
};

const emptyOr = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    schema.optional()
  );

export const registroAccessiFilterSchema = z.object({
  dateFrom: emptyOr(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dateTo: emptyOr(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  email: emptyOr(z.string().trim().max(160)),
  evento: emptyOr(z.enum(REGISTRO_ACCESSI_EVENTI)),
  esito: emptyOr(z.enum(REGISTRO_ACCESSI_ESITI)),
  offset: z.number().int().min(0).max(20_000).optional().default(0),
});

export function eventoAccessoLabel(evento: RegistroAccessoEvento): string {
  if (evento === "login") return "Ingresso (password)";
  if (evento === "login_fallito") return "Password errata";
  if (evento === "2fa_ok") return "Verifica 2FA";
  if (evento === "2fa_fallito") return "2FA non riuscita";
  return "Uscita";
}

export function esitoAccessoLabel(esito: RegistroAccessoEsito): string {
  return esito === "successo" ? "OK" : "Fallito";
}

export function metodo2faLabel(metodo: RegistroAccessoMetodo2fa | null): string {
  if (metodo === "email") return "Codice email";
  if (metodo === "app") return "Authenticator";
  return "—";
}

export function formatAccessoDataOra(iso: string): { data: string; ora: string; full: string } {
  const d = new Date(iso);
  const data = d.toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const ora = d.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return { data, ora, full: `${data} ${ora}` };
}

export function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
