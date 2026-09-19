import { NextResponse } from "next/server";
import { salvaUnAllegato } from "@/lib/strumenti/ticket-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const ticketId = String(formData.get("ticketId") ?? "");
    const messaggioId = String(formData.get("messaggioId") ?? "");
    const raw = formData.get("file");
    if (!ticketId || !messaggioId) {
      return NextResponse.json(
        { success: false, error: "Ticket o messaggio mancanti." },
        { status: 400 }
      );
    }
    if (!raw || typeof raw === "string") {
      return NextResponse.json(
        { success: false, error: "File mancante." },
        { status: 400 }
      );
    }
    const blob = raw as File;
    const bytes = Buffer.from(await blob.arrayBuffer());
    const name =
      typeof blob.name === "string" && blob.name.trim()
        ? blob.name
        : "allegato.bin";
    const saved = await salvaUnAllegato({
      ticketId,
      messaggioId,
      file: { name, mime: blob.type || "", bytes },
    });
    if (!saved.success) {
      return NextResponse.json(saved, { status: 400 });
    }
    return NextResponse.json(saved);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Caricamento allegato non riuscito.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
