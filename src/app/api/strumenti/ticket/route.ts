import { NextResponse } from "next/server";
import { getTicketAction } from "@/app/actions/strumenti-ticket";
import {
  allegatiDaFormData,
  audioDaFormData,
  fileCountAtteso,
} from "@/lib/strumenti/ticket-bytes";
import { creaTicketConAllegati } from "@/lib/strumenti/ticket-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = await allegatiDaFormData(formData);
    const audio = await audioDaFormData(formData);
    const created = await creaTicketConAllegati({
      categoria: String(formData.get("categoria") ?? ""),
      urgenza: String(formData.get("urgenza") ?? ""),
      descrizione: String(formData.get("descrizione") ?? ""),
      files,
      audio,
      attesi: fileCountAtteso(formData),
    });
    if (!created.success) {
      return NextResponse.json(created, { status: 400 });
    }
    const loaded = await getTicketAction(created.ticketId);
    if (!loaded.success) {
      return NextResponse.json(loaded, { status: 400 });
    }
    return NextResponse.json(loaded);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invio ticket non riuscito.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
