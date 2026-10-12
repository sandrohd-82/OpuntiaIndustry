import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { TWO_FA_SESSION_COOKIE } from "@/lib/auth/constants";
import {
  cercaLinkOspite,
  COOKIE_OSPITE_COMMERCIALISTA,
  ENTITY_LINK_SCONOSCIUTO,
  opzioniCookieOspite,
  PERCORSO_OSPITE_COMMERCIALISTA,
  registraAuditOspite,
} from "@/lib/amministrazione/commercialista-ospite";

const AUTH_PATHS = ["/login"];
const VERIFY_PATH = "/verify-email";

function copySessionCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c);
  });
  return to;
}

function percorsoSenzaSegreto(request: NextRequest): string {
  const url = request.nextUrl.clone();
  url.searchParams.delete("accesso");
  const query = url.searchParams.toString();
  const path = query ? `${url.pathname}?${query}` : url.pathname;
  return path.slice(0, 300);
}

function negaLinkOspite(request: NextRequest, supabaseResponse: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("motivo", "link");
  const res = copySessionCookies(supabaseResponse, NextResponse.redirect(url));
  res.cookies.set(COOKIE_OSPITE_COMMERCIALISTA, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
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
  if (!user) {
    const tokenQuery = request.nextUrl.searchParams.get("accesso")?.trim() ?? "";
    const tokenCookie =
      request.cookies.get(COOKIE_OSPITE_COMMERCIALISTA)?.value?.trim() ?? "";
    const sullaPagina = pathname === PERCORSO_OSPITE_COMMERCIALISTA;
    const tokenPresentato = sullaPagina ? tokenQuery || tokenCookie : tokenCookie;

    if (tokenPresentato) {
      const link = await cercaLinkOspite(tokenPresentato);
      if (sullaPagina && link) {
        if (tokenQuery) {
          await registraAuditOspite({
            entityId: link.id,
            action: "status_change",
            summary: "Apertura pagina commercialista tramite link",
            payload: {
              percorso: PERCORSO_OSPITE_COMMERCIALISTA,
              fino_al: link.expires_at,
            },
          });
          const pulito = request.nextUrl.clone();
          pulito.searchParams.delete("accesso");
          const res = copySessionCookies(
            supabaseResponse,
            NextResponse.redirect(pulito)
          );
          res.cookies.set(
            COOKIE_OSPITE_COMMERCIALISTA,
            tokenQuery,
            opzioniCookieOspite(link.expires_at)
          );
          return res;
        }
        const referer = request.headers.get("referer") ?? "";
        const documento =
          request.method === "GET" &&
          request.headers.get("sec-fetch-dest") === "document" &&
          !referer.includes("accesso=");
        if (documento) {
          await registraAuditOspite({
            entityId: link.id,
            action: "status_change",
            summary: "Ritorno sulla pagina commercialista con link ancora valido",
            payload: {
              percorso: PERCORSO_OSPITE_COMMERCIALISTA,
              fino_al: link.expires_at,
            },
          });
        }
        supabaseResponse.cookies.set(
          COOKIE_OSPITE_COMMERCIALISTA,
          tokenCookie,
          opzioniCookieOspite(link.expires_at)
        );
        return supabaseResponse;
      }

      await registraAuditOspite({
        entityId: link?.id ?? ENTITY_LINK_SCONOSCIUTO,
        action: "status_change",
        summary: link
          ? "Accesso negato: URL diversa dalla pagina commercialista"
          : "Accesso negato: link commercialista non valido o scaduto",
        payload: {
          percorso: percorsoSenzaSegreto(request),
          motivo: link ? "url_diversa" : "link_non_valido",
        },
      });
      return negaLinkOspite(request, supabaseResponse);
    }

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
