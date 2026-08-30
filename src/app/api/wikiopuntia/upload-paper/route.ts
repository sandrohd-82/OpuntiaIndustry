import { NextResponse } from "next/server";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { extractWikiPaperWithGemini } from "@/lib/wikiopuntia/gemini-paper";
import {
  sanitizeStorageSegment,
  uploadWikiPdfPublic,
} from "@/lib/wikiopuntia/storage";
import { slugFromTitle } from "@/lib/ecosystem/wiki";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  const allowed =
    isAdminLikeProfile(auth.profile) ||
    userCanAccessArea(auth.areas, "wikiopuntia");
  if (!allowed) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File PDF mancante" }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Sono ammessi solo PDF" },
      { status: 400 }
    );
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF oltre 50 MB" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const year = new Date().getUTCFullYear();
  const baseName = sanitizeStorageSegment(
    file.name.replace(/\.pdf$/i, "") || "paper"
  );
  const storagePath = `papers/${year}/${baseName}-${Date.now()}.pdf`;

  try {
    const uploaded = await uploadWikiPdfPublic({ bytes, storagePath });
    const extracted = await extractWikiPaperWithGemini(bytes);
    return NextResponse.json({
      publicUrl: uploaded.publicUrl,
      storagePath: uploaded.storagePath,
      slug: slugFromTitle(extracted.data.title),
      extracted: extracted.data,
      model: extracted.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload/analisi fallita";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
