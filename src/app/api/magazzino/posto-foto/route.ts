import { NextResponse } from "next/server";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isConfigStato, parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import {
  queryFotoPosto,
  queryFotoPrincipali,
} from "@/lib/magazzino/posto-foto-query";
import { salvaFotoPosto } from "@/lib/magazzino/posto-foto-upload";
import { aggiornaFitFotoSchema, type PostoFoto } from "@/lib/magazzino/posto-foto";
import { createServiceClient } from "@/lib/supabase/server";
import type { AreaSlug } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const AREE: AreaSlug[] = [
  "magazzino",
  "strumenti",
  "amministrazione",
  "produzione",
  "commerciale",
  "action",
  "area-fiscale",
  "promemorie-e-note",
];

async function puoVedereFoto(): Promise<boolean> {
  const auth = await getAuthContext();
  if (!auth) return false;
  if (isUnrestrictedSuperadmin(auth)) return true;
  if (
    auth.impersonating &&
    isConfigStato(parseProfileStatoOperativo(auth.profile.stato_operativo))
  ) {
    return true;
  }
  return AREE.some((s) => userCanAccessArea(auth.areas, s));
}

export async function GET(request: Request) {
  try {
    if (!(await puoVedereFoto())) {
      return NextResponse.json(
        { success: false, error: "Accesso richiesto." },
        { status: 401 }
      );
    }
    const url = new URL(request.url);
    const ubicazioneId = url.searchParams.get("ubicazioneId") ?? "";
    const idsRaw = url.searchParams.get("ids") ?? "";
    if (ubicazioneId) {
      const res = await queryFotoPosto(ubicazioneId);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }
    if (idsRaw) {
      const res = await queryFotoPrincipali(idsRaw.split(","));
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }
    return NextResponse.json({ success: true, foto: [] });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Elenco foto non disponibile.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "File troppo grande per il trasferimento. Il sistema la ridimensiona: riprova.",
        },
        { status: 413 }
      );
    }
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
    const foto: PostoFoto[] = [];
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
      foto.push(saved.foto);
    }
    return NextResponse.json({ success: true, ids, foto });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Caricamento foto non riuscito.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await puoVedereFoto())) {
      return NextResponse.json(
        { success: false, error: "Accesso richiesto." },
        { status: 401 }
      );
    }
    const auth = await getAuthContext();
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = aggiornaFitFotoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Fit non valido." },
        { status: 400 }
      );
    }
    const db = createServiceClient();
    const { error } = await db
      .from("magazzino_posto_foto")
      .update({
        fit_scale: parsed.data.fitScale,
        offset_x: parsed.data.offsetX,
        offset_y: parsed.data.offsetY,
        updated_by: auth?.userId ?? null,
      })
      .eq("id", parsed.data.id)
      .is("deleted_at", null);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Ritaglio non salvato.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
