import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { syncWebmailLive } from "@/lib/webmail/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
});

function canAccessWebmail(auth: NonNullable<
  Awaited<ReturnType<typeof getAuthContext>>
>) {
  return (
    isAdminLikeProfile(auth.profile) ||
    userCanAccessArea(auth.areas, "webmail") ||
    userCanAccessArea(auth.areas, "commerciale") ||
    userCanAccessArea(auth.areas, "amministrazione")
  );
}

/**
 * Ascolto IMAP (IDLE) della casella: importa le mail nuove appena arrivano.
 * Chiamata in loop dal pulsante «Mantieni sincronizzato».
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (!auth.isSecondFactorVerified) {
    return NextResponse.json(
      { error: "Verifica email richiesta." },
      { status: 403 }
    );
  }
  if (!canAccessWebmail(auth)) {
    return NextResponse.json({ error: "Accesso negato." }, { status: 403 });
  }

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Casella non valida." },
      { status: 400 }
    );
  }

  const userSb = await createClient();
  let allowedQuery = userSb
    .from("webmail_accounts")
    .select("id")
    .is("deleted_at", null);
  if (parsed.data.accountId) {
    allowedQuery = allowedQuery.eq("id", parsed.data.accountId);
  }
  const { data: allowed, error: allowErr } = await allowedQuery;
  if (allowErr) {
    return NextResponse.json({ error: allowErr.message }, { status: 400 });
  }
  const accountIds = (allowed ?? []).map((r) => String(r.id));
  if (accountIds.length === 0) {
    return NextResponse.json(
      { error: "Nessuna casella disponibile." },
      { status: 404 }
    );
  }

  try {
    const service = createServiceClient();
    const result = await syncWebmailLive(service, {
      accountId: parsed.data.accountId || undefined,
      accountIds: parsed.data.accountId ? undefined : accountIds,
      userId: auth.userId,
    });
    return NextResponse.json({
      success: true,
      imported: result.imported,
      importedIds: result.importedIds,
      waited: result.waited,
      emails: result.emails,
      errors: result.errors,
    });
  } catch (e) {
    console.error("[webmail live-sync]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Errore durante l’ascolto della casella.",
      },
      { status: 500 }
    );
  }
}
