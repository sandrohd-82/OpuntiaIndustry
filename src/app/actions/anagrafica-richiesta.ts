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
import {
  casellaInvioAnagrafica,
  ERRORE_CASELLA_ANAGRAFICA,
  inviaDaCasellaAnagrafica,
} from "@/lib/anagrafica/casella-invio";

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
}): Promise<{ success: true; destinatario: string } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const destinatario = input.email.trim();
  if (!emailOk(destinatario)) {
    return { success: false, error: "Indica un'e-mail valida a cui inviare il link." };
  }
  const scheda = await precompilaDaScheda(input.kind, input.id);
  if ("errore" in scheda) return { success: false, error: scheda.errore };
  const account = await casellaInvioAnagrafica();
  if (!account) {
    return { success: false, error: ERRORE_CASELLA_ANAGRAFICA };
  }
  const token = nuovoToken();
  const url = `${getPublicAppUrl()}/anagrafica/${token}`;
  const nome = scheda.ragioneSociale || "Spettabile azienda";
  try {
    await inviaDaCasellaAnagrafica({
      to: destinatario,
      subject: "Anagrafica aziendale da compilare",
      text: [
        `Spett.le ${nome},`,
        "",
        "vi chiediamo di compilare l'anagrafica aziendale a questo link, valido 7 giorni:",
        url,
        "",
        "Ogni campo viene salvato appena uscite dal campo. Potete chiudere e riprendere più tardi, entro la scadenza.",
        "Al termine firmate l'anagrafica sullo stesso link con un codice inviato a questa e-mail. Poi, sempre da questo link, firmate l'informativa privacy e le condizioni generali di vendita.",
        ...(FASE_TEST_ANAGRAFICA
          ? ["", "Questa è una prova: i dati potranno essere annullati e la scheda ripristinata."]
          : []),
      ].join("\n"),
    });
  } catch (errore) {
    const testo = errore instanceof Error ? errore.message : "";
    console.error(
      "[anagrafica invio]",
      testo.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[mail]").slice(0, 300)
    );
    if (testo === ERRORE_CASELLA_ANAGRAFICA) {
      return { success: false, error: testo };
    }
    if (/535|autentic/i.test(testo)) {
      return {
        success: false,
        error: "La casella info@agrinsicilia.com ha rifiutato l'accesso. Il link non è stato attivato.",
      };
    }
    if (/550|553|554/.test(testo)) {
      return {
        success: false,
        error: "L'indirizzo del destinatario è stato rifiutato. Il link non è stato attivato.",
      };
    }
    if (/timeout|ETIMEDOUT|chiusa inaspettatamente|ECONN/i.test(testo)) {
      return {
        success: false,
        error: "Il server non raggiunge la posta in uscita. Il link non è stato attivato.",
      };
    }
    return { success: false, error: "Invio della mail non riuscito. Il link non è stato attivato." };
  }
  const salvata = await preparaInvioAnagrafica({
    kind: input.kind,
    id: input.id,
    email: destinatario,
    actorId: auth.userId,
    token,
  });
  if ("errore" in salvata) {
    return {
      success: false,
      error: "La mail è partita, ma il link non è stato registrato. Invia di nuovo.",
    };
  }
  return { success: true, destinatario };
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
