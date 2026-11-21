import type { AccessTone } from "@/lib/auth/page-access";
import type { WebmailAccountPublic } from "@/lib/webmail/types";

/** Errore del client HTTP, non un esito restituito dall'azione. */
export const ERRORE_TRASPORTO_MENU_WEBMAIL = "Lettura non disponibile.";

export type MenuWebmailLetto =
  | {
      success: true;
      accounts: WebmailAccountPublic[];
      grantedIds: string[];
      assignMode: boolean;
      grantTone: AccessTone;
    }
  | { success: false; error: string };

/**
 * La GET restituisce il corpo dell'azione quando la risposta è 200.
 * Un errore di trasporto non deve cancellare le caselle già mostrate:
 * la Server Action, in quel caso, rifiuta la promise e lascia lo stato.
 */
export function esitoMenuWebmail(
  res: MenuWebmailLetto
): "applica" | "svuota" | "conserva" {
  if (res.success) return "applica";
  if (res.error === ERRORE_TRASPORTO_MENU_WEBMAIL) return "conserva";
  return "svuota";
}
