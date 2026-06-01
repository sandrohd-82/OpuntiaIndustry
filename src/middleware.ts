import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { TWO_FA_SESSION_COOKIE } from "@/lib/auth/constants";

const PUBLIC_PATHS = ["/", "/login", "/auth/callback"];
const AUTH_PATHS = ["/login"];
const VERIFY_PATH = "/verify-email";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseResponse, user } = await updateSession(request);

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith("/auth/")
  );
  const isAuthPage = AUTH_PATHS.includes(pathname);
  const isVerifyPage = pathname === VERIFY_PATH;
  const isAppArea = pathname.startsWith("/app");

  if (!user) {
    if (isAppArea || isVerifyPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const has2faCookie = Boolean(
    request.cookies.get(TWO_FA_SESSION_COOKIE)?.value
  );

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = has2faCookie ? "/app/dashboard" : VERIFY_PATH;
    return NextResponse.redirect(url);
  }

  if (user && isAppArea && !has2faCookie) {
    const url = request.nextUrl.clone();
    url.pathname = VERIFY_PATH;
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isVerifyPage && has2faCookie) {
    const url = request.nextUrl.clone();
    url.pathname =
      request.nextUrl.searchParams.get("redirect") || "/app/dashboard";
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
