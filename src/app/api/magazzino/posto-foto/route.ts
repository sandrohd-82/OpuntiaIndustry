import { NextResponse } from "next/server";
import { salvaFotoPosto } from "@/lib/magazzino/posto-foto-upload";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const ubicazioneId = String(formData.get("ubicazioneId") ?? "");
    const files = formData.getAll("file").filter((v) => v && typeof v !== "string");
    if (!ubicazioneId) {
      return NextResponse.json(
        { success: false, error: "Posto mancante." },
        { status: 400 }
      );
    }
    if (!files.length) {
      return NextResponse.json(
        { success: false, error: "Nessuna immagine." },
        { status: 400 }
      );
    }
    const ids: string[] = [];
    for (const raw of files) {
      const blob = raw as File;
      const bytes = Buffer.from(await blob.arrayBuffer());
      const saved = await salvaFotoPosto({
        ubicazioneId,
        fileName: blob.name || "foto.jpg",
        mime: blob.type || "image/jpeg",
        bytes,
      });
      if (!saved.success) {
        return NextResponse.json(saved, { status: 400 });
      }
      ids.push(saved.id);
    }
    return NextResponse.json({ success: true, ids });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Caricamento foto non riuscito.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
