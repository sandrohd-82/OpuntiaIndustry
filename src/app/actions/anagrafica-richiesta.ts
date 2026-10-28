"use server";

import { getPublicAppUrl } from "@/lib/auth/app-url";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { FASE_TEST_ANAGRAFICA } from "@/lib/anagrafica/fase-test";
import {
  annullaTestAnagrafica,
  nuovoToken,
  preparaInvioAnagrafica,
  precompilaDaScheda,
  riepilogoRichiesta,
} from "@/lib/anagrafica/richiesta-db";
import { createServiceClient } from "@/lib/supabase/service";
import { sendMailViaAccount, type AccountRow } from "@/lib/webmail/sync";

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function casellaInvio(): Promise<AccountRow | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .is("deleted_at", null)
    .limit(8);
  if (error) return null;
  return (
    ((data ?? []) as AccountRow[]).find(
      (riga) => riga.smtp_host && riga.password_encrypted
    ) ?? null
  );
}

export async function riepilogoAnagraficaFormAction(input: {
  kind: "cliente" | "cliente_possibile";
  id: string;
}) {
  await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  return riepilogoRichiesta(input.kind, input.id);
}

export async function inviaRichiestaAnagraficaAction(input: {
  kind: "cliente" | "cliente_possibile";
  id: string;
  email: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const email = input.email.trim();
  if (!emailOk(email)) {
    return { success: false, error: "Indica un'e-mail valida a cui inviare il link." };
  }
  const scheda = await precompilaDaScheda(input.kind, input.id);
  if ("errore" in scheda) return { success: false, error: scheda.errore };
  const account = await casellaInvio();
  if (!account) {
    return {
      success: false,
      error: "Nessuna casella con SMTP. La mail non è partita.",
    };
  }
  const token = nuovoToken();
  const url = `${getPublicAppUrl()}/anagrafica/${token}`;
  const nome = scheda.ragioneSociale || "Spettabile azienda";
  try {
    await sendMailViaAccount({
      account,
      to: email,
      subject: "Anagrafica aziendale da compilare",
      text: [
        `Spett.le ${nome},`,
        "",
        "vi chiediamo di compilare l'anagrafica aziendale a questo link, valido 7 giorni:",
        url,
        "",
        "Ogni campo viene salvato appena uscite dal campo. Potete chiudere e riprendere più tardi, entro la scadenza.",
        "Al termine scaricate il PDF, stampatelo su carta intestata, timbratelo, firmatelo e ricaricatelo sullo stesso link.",
        ...(FASE_TEST_ANAGRAFICA
          ? ["", "Questa è una prova: i dati potranno essere annullati e la scheda ripristinata."]
          : []),
      ].join("\n"),
    });
  } catch {
    return { success: false, error: "Invio della mail non riuscito. Il link non è stato attivato." };
  }
  const salvata = await preparaInvioAnagrafica({
    kind: input.kind,
    id: input.id,
    email,
    actorId: auth.userId,
    token,
  });
  if ("errore" in salvata) {
    return {
      success: false,
      error: "La mail è partita, ma il link non è stato registrato. Invia di nuovo.",
    };
  }
  return { success: true };
}

export async function annullaTestAnagraficaAction(input: {
  kind: "cliente" | "cliente_possibile";
  id: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const esito = await annullaTestAnagrafica({
    kind: input.kind,
    id: input.id,
    actorId: auth.userId,
  });
  if ("errore" in esito) return { success: false, error: esito.errore };
  return { success: true };
}
