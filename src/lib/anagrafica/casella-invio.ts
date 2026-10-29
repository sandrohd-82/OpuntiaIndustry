import { createServiceClient } from "@/lib/supabase/service";
import type { AccountRow } from "@/lib/webmail/sync";

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
