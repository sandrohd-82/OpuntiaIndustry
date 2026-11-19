import { NextResponse } from "next/server";
import { listHaccpRoutineAction } from "@/app/actions/haccp";
import { listMappaMenuNavAction } from "@/app/actions/magazzino-mappa";
import { countUnreadNotificheAction, vapidPublicKeyAction } from "@/app/actions/notifiche";
import { countOrdiniDaProcessareAction } from "@/app/actions/ordini";
import { listMieiAvvisiPendentiAction } from "@/app/actions/pn-avvisi";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import { getTicketNavBadgeAction } from "@/app/actions/strumenti-ticket-impostazioni";
import { listWebmailMenuAccountsAction } from "@/app/actions/webmail";
import { classificaControlloNav } from "@/lib/navigazione/controlli-nav";
import { NOTIFICA_TIPI } from "@/lib/notifiche/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(corpo: unknown, status = 200) {
  return NextResponse.json(corpo, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}

function negatoDalControllo(error: unknown): boolean {
  const digest =
    typeof error === "object" && error && "digest" in error
      ? String((error as { digest?: string }).digest ?? "")
      : "";
  return digest.startsWith("NEXT_");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const controllo = url.searchParams.get("controllo") ?? "";
  if (classificaControlloNav(controllo) !== "get") {
    return json({ success: false, error: "Lettura non disponibile." }, 404);
  }
  try {
    if (controllo === "notifiche-non-lette") {
      const tipo = url.searchParams.get("tipo") ?? "";
      const filtro = (NOTIFICA_TIPI as readonly string[]).includes(tipo) ? tipo : undefined;
      return json(await countUnreadNotificheAction(filtro));
    }
    if (controllo === "avvisi-pendenti") return json(await listMieiAvvisiPendentiAction());
    if (controllo === "ticket-badge") return json(await getTicketNavBadgeAction());
    if (controllo === "ordini-da-processare") return json(await countOrdiniDaProcessareAction());
    if (controllo === "mappa-menu") return json(await listMappaMenuNavAction());
    if (controllo === "produzione-aree") return json(await listProduzioneAreeAction());
    if (controllo === "haccp-routine") return json(await listHaccpRoutineAction());
    if (controllo === "webmail-menu") return json(await listWebmailMenuAccountsAction());
    return json({ chiave: await vapidPublicKeyAction() });
  } catch (error) {
    if (negatoDalControllo(error)) {
      return json({ success: false, error: "Non disponibile." }, 403);
    }
    return json({ success: false, error: "Lettura non disponibile." }, 500);
  }
}
