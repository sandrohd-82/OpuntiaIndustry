import { createServiceClient } from "@/lib/supabase/service";
import { sendMailViaAccount, type AccountRow } from "@/lib/webmail/sync";

export const CASELLA_ANAGRAFICA = "info@agrinsicilia.com";

/** Link del foglio e codici OTP escono solo da questa casella. */
export async function casellaInvioAnagrafica(): Promise<AccountRow | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .ilike("email_address", CASELLA_ANAGRAFICA)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const account = data as AccountRow;
  if (!account.smtp_host || !account.password_encrypted) return null;
  return account;
}

export const ERRORE_CASELLA_ANAGRAFICA =
  "La mail non è partita: manca la casella info@agrinsicilia.com con SMTP.";

/** Risposta SMTP 525: rifiuto temporaneo dell'invio, con la casella e la password ancora valide. */
export const ERRORE_INVIO_SOSPESO_ARUBA =
  "Aruba ha rifiutato l'invio di info@agrinsicilia.com. La password è valida e la casella è attiva. Riprova tra un minuto.";

export function arubaHaSospesoInvio(testo: string): boolean {
  return /\b525\b|disabilitato per la casella|sending temporarily disabled/i.test(testo);
}

/** Link e OTP escono dalla casella info, con lo stesso canale SMTP degli accessi. */
export async function inviaDaCasellaAnagrafica(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const account = await casellaInvioAnagrafica();
  if (!account) throw new Error(ERRORE_CASELLA_ANAGRAFICA);
  const html = input.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
  await sendMailViaAccount({
    account,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html,
    fromName: "Agrinsicilia",
  });
}
