import { NextResponse } from "next/server";
import { z } from "zod";
import { bootstrapAppNavAction } from "@/app/actions/nav-bootstrap";
import { countPreventiviAttesaSpedizioneNavAction } from "@/app/actions/preventivi";
import { rilevaSchedeTrelloAction } from "@/app/actions/trello-utente";
import { classificaControlloNav } from "@/lib/navigazione/controlli-nav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const richiesta = z.discriminatedUnion("controllo", [
  z.object({ controllo: z.literal("trello") }),
  z.object({ controllo: z.literal("preventivi-spedizione") }),
  z.object({
    controllo: z.literal("bootstrap"),
    flags: z.object({
      ordini: z.boolean(),
      notifiche: z.boolean(),
      ticket: z.boolean(),
      mappa: z.boolean(),
      produzione: z.boolean(),
      webmailAccounts: z.boolean(),
      webmailGrant: z.boolean(),
      spedizione: z.boolean(),
    }),
  }),
]);

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

export async function POST(request: Request) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return json({ success: false, error: "Richiesta non valida." }, 400);
  }
  const parsed = richiesta.safeParse(corpo);
  if (!parsed.success || classificaControlloNav(parsed.data.controllo) !== "post") {
    return json({ success: false, error: "Controllo non disponibile." }, 404);
  }
  try {
    if (parsed.data.controllo === "trello") return json(await rilevaSchedeTrelloAction());
    if (parsed.data.controllo === "preventivi-spedizione") {
      return json(await countPreventiviAttesaSpedizioneNavAction());
    }
    return json(await bootstrapAppNavAction(parsed.data.flags));
  } catch (error) {
    if (negatoDalControllo(error)) {
      return json({ success: false, error: "Non disponibile." }, 403);
    }
    return json({ success: false, error: "Controllo non disponibile." }, 500);
  }
}
