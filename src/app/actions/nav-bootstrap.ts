"use server";

import { countOrdiniDaProcessareAction } from "@/app/actions/ordini";
import { countPreventiviAttesaSpedizioneNavAction } from "@/app/actions/preventivi";
import { countUnreadNotificheAction } from "@/app/actions/notifiche";
import { getTicketNavBadgeAction } from "@/app/actions/strumenti-ticket-impostazioni";
import { listMappaMenuNavAction } from "@/app/actions/magazzino-mappa";
import { listHaccpRoutineAction } from "@/app/actions/haccp";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import {
  listWebmailAccountsAction,
  listWebmailMenuAccountsAction,
} from "@/app/actions/webmail";

export async function bootstrapAppNavAction(flags: {
  ordini: boolean;
  notifiche: boolean;
  ticket: boolean;
  mappa: boolean;
  produzione: boolean;
  webmailAccounts: boolean;
  webmailGrant: boolean;
  spedizione: boolean;
}) {
  const [
    ordini,
    notifiche,
    ticket,
    mappa,
    produzione,
    haccp,
    webmailAccounts,
    webmailGrant,
    spedizione,
  ] = await Promise.all([
    flags.ordini
      ? countOrdiniDaProcessareAction()
      : Promise.resolve(null),
    flags.notifiche
      ? countUnreadNotificheAction("attivita")
      : Promise.resolve(null),
    flags.ticket ? getTicketNavBadgeAction() : Promise.resolve(null),
    flags.mappa ? listMappaMenuNavAction() : Promise.resolve(null),
    flags.produzione ? listProduzioneAreeAction() : Promise.resolve(null),
    flags.produzione ? listHaccpRoutineAction() : Promise.resolve(null),
    flags.webmailAccounts
      ? listWebmailAccountsAction()
      : Promise.resolve(null),
    flags.webmailGrant
      ? listWebmailMenuAccountsAction()
      : Promise.resolve(null),
    flags.spedizione
      ? countPreventiviAttesaSpedizioneNavAction()
      : Promise.resolve(null),
  ]);

  return {
    ordini,
    notifiche,
    ticket,
    mappa,
    produzione,
    haccp,
    webmailAccounts,
    webmailGrant,
    spedizione,
  };
}
