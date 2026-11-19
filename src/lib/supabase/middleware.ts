import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isOperatorSelfLoginAllowed,
  parseProfileStatoOperativo,
} from "@/lib/auth/stato-operativo";
import type { ProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { notaPrestazione } from "@/lib/diagnostica/prestazioni";

function nextWithForwardedCookies(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const cookieHeader = request.cookies
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (cookieHeader) {
    requestHeaders.set("cookie", cookieHeader);
  }
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = nextWithForwardedCookies(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = nextWithForwardedCookies(request);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const inizioSessione = performance.now();
  const inizioUtente = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const utenteMs = Math.round(performance.now() - inizioUtente);
  notaPrestazione("middleware.getUser", inizioUtente);

  let statoOperativo: ProfileStatoOperativo = "operativo";
  let statoMs: number | null = null;
  if (user) {
    const inizioProfilo = performance.now();
    const { data } = await supabase
      .from("profiles")
      .select("stato_operativo")
      .eq("id", user.id)
      .maybeSingle();
    statoMs = Math.round(performance.now() - inizioProfilo);
    notaPrestazione("middleware.stato", inizioProfilo);
    statoOperativo = parseProfileStatoOperativo(data?.stato_operativo);
    if (!isOperatorSelfLoginAllowed(statoOperativo)) {
      await supabase.auth.signOut();
      segnaTempiSessione(supabaseResponse, inizioSessione, utenteMs, statoMs);
      return { supabaseResponse, user: null, statoOperativo };
    }
  }

  segnaTempiSessione(supabaseResponse, inizioSessione, utenteMs, statoMs);
  return { supabaseResponse, user, statoOperativo };
}

function segnaTempiSessione(
  risposta: NextResponse,
  inizioSessione: number,
  utenteMs: number,
  statoMs: number | null
) {
  risposta.headers.append("Server-Timing", `middleware-utente;dur=${utenteMs}`);
  if (statoMs != null) {
    risposta.headers.append("Server-Timing", `middleware-stato;dur=${statoMs}`);
  }
  risposta.headers.append(
    "Server-Timing",
    `middleware-sessione;dur=${Math.round(performance.now() - inizioSessione)}`
  );
}
