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

  const inizioUtente = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  notaPrestazione("middleware.getUser", inizioUtente);

  let statoOperativo: ProfileStatoOperativo = "operativo";
  if (user) {
    const inizioProfilo = performance.now();
    const { data } = await supabase
      .from("profiles")
      .select("stato_operativo")
      .eq("id", user.id)
      .maybeSingle();
    notaPrestazione("middleware.stato", inizioProfilo);
    statoOperativo = parseProfileStatoOperativo(data?.stato_operativo);
    if (!isOperatorSelfLoginAllowed(statoOperativo)) {
      await supabase.auth.signOut();
      return { supabaseResponse, user: null, statoOperativo };
    }
  }

  return { supabaseResponse, user, statoOperativo };
}
