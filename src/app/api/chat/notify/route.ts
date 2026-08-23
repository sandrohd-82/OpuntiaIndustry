import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = { messageId?: string };

/**
 * Push FCM opzionale al destinatario di un messaggio.
 * Non è il transport dei messaggi (Realtime).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }
  if (!body.messageId) {
    return NextResponse.json({ error: "messageId obbligatorio" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: msg, error } = await admin
    .from("messages")
    .select("id, sender_id, conversation_id, content")
    .eq("id", body.messageId)
    .maybeSingle();
  if (error || !msg) {
    return NextResponse.json({ error: "Messaggio non trovato" }, { status: 404 });
  }
  if (msg.sender_id !== user.id) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { data: conv } = await admin
    .from("conversations")
    .select("customer_id, producer_id")
    .eq("id", msg.conversation_id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "Conversazione non trovata" }, { status: 404 });
  }

  const recipientId =
    conv.customer_id === msg.sender_id ? conv.producer_id : conv.customer_id;

  const { data: tokens } = await admin
    .from("chat_fcm_tokens")
    .select("token")
    .eq("user_id", recipientId);

  const tokenList = (tokens ?? []).map((t) => t.token as string);
  if (tokenList.length === 0) {
    return NextResponse.json({ ok: true, pushed: 0, reason: "no_tokens" });
  }

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    return NextResponse.json({
      ok: true,
      pushed: 0,
      reason: "fcm_not_configured",
    });
  }

  try {
    const pushed = await sendFcmMulticast(saJson, tokenList, {
      type: "chat",
      conversationId: String(msg.conversation_id),
      openChat: "1",
      title: "Nuovo messaggio",
      body: String(msg.content || "Hai ricevuto un messaggio").slice(0, 120),
    });
    return NextResponse.json({ ok: true, pushed });
  } catch (e) {
    console.error("[chat/notify]", e);
    return NextResponse.json(
      { error: "Push fallita", detail: e instanceof Error ? e.message : "err" },
      { status: 500 }
    );
  }
}

async function sendFcmMulticast(
  serviceAccountJson: string,
  tokens: string[],
  data: Record<string, string>
): Promise<number> {
  const sa = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
    project_id: string;
  };
  const accessToken = await getGoogleAccessToken(sa);
  let pushed = 0;
  for (const token of tokens) {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            data,
            notification: {
              title: data.title,
              body: data.body,
            },
          },
        }),
      }
    );
    if (res.ok) pushed += 1;
  }
  return pushed;
}

async function getGoogleAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPkcs8(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64url(sig)}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`OAuth token failed: ${await tokenRes.text()}`);
  }
  const json = (await tokenRes.json()) as { access_token: string };
  return json.access_token;
}

function b64url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPkcs8(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
