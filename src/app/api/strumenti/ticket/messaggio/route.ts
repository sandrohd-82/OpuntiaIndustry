import { NextResponse } from "next/server";
import { getTicketAction } from "@/app/actions/strumenti-ticket";
import {
  allegatiDaFormData,
  audioDaFormData,
  fileCountAtteso,
} from "@/lib/strumenti/ticket-bytes";
import { inviaMessaggioConAllegati } from "@/lib/strumenti/ticket-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = await allegatiDaFormData(formData);
    const audio = await audioDaFormData(formData);
    const sent = await inviaMessaggioConAllegati({
      ticketId: String(formData.get("ticketId") ?? ""),
      contenuto: String(formData.get("contenuto") ?? ""),
      files,
      audio,
      attesi: fileCountAtteso(formData),
    });
    if (!sent.success) {
      return NextResponse.json(sent, { status: 400 });
    }
    const loaded = await getTicketAction(sent.ticketId);
    if (!loaded.success) {
      return NextResponse.json(loaded, { status: 400 });
    }
    return NextResponse.json(loaded);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invio messaggio non riuscito.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
