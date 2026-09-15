import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { TWO_FA_SESSION_COOKIE } from "@/lib/auth/constants";

const AUTH_PATHS = ["/login"];
const VERIFY_PATH = "/verify-email";

function copySessionCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c);
  });
  return to;
}

function safeAppRedirect(raw: string | null): string {
  const path = (raw ?? "").trim();
  if (!path.startsWith("/app")) return "/app/dashboard";
  if (path.startsWith("//")) return "/app/dashboard";
  if (path === VERIFY_PATH || path === "/login") return "/app/dashboard";
  return path;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseResponse, user, statoOperativo } =
    await updateSession(request);

  const isAuthPage = AUTH_PATHS.includes(pathname);
  const isVerifyPage = pathname === VERIFY_PATH;
  const isAppArea = pathname.startsWith("/app");
  const isPrimoAccesso = pathname.startsWith("/primo-accesso");

  if (isPrimoAccesso) {
    return supabaseResponse;
  }

  if (!user) {
    if (isAppArea || isVerifyPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      if (statoOperativo !== "operativo") {
        url.searchParams.set("motivo", statoOperativo);
      }
      return copySessionCookies(supabaseResponse, NextResponse.redirect(url));
    }
    return supabaseResponse;
  }

  const has2faCookie = Boolean(
    request.cookies.get(TWO_FA_SESSION_COOKIE)?.value
  );

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = has2faCookie ? safeAppRedirect(
      request.nextUrl.searchParams.get("redirect")
    ) : VERIFY_PATH;
    if (!has2faCookie) {
      const next = request.nextUrl.searchParams.get("redirect");
      if (next?.startsWith("/app")) {
        url.searchParams.set("redirect", next);
      }
    } else {
      url.searchParams.delete("redirect");
      url.searchParams.delete("motivo");
    }
    return copySessionCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (user && isAppArea && !has2faCookie) {
    const url = request.nextUrl.clone();
    url.pathname = VERIFY_PATH;
    url.searchParams.set("redirect", pathname);
    return copySessionCookies(supabaseResponse, NextResponse.redirect(url));
  }

  /** Non bounce /verify-email solo perché il cookie esiste: può essere scaduto. */
  if (user && isVerifyPage) {
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
