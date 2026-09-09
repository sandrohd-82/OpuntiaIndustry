import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import type { ProfileStatoOperativo } from "@/lib/auth/stato-operativo";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let statoOperativo: ProfileStatoOperativo = "operativo";
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("stato_operativo")
      .eq("id", user.id)
      .maybeSingle();
    statoOperativo = parseProfileStatoOperativo(data?.stato_operativo);
    if (statoOperativo !== "operativo") {
      await supabase.auth.signOut();
      return { supabaseResponse, user: null, statoOperativo };
    }
  }

  return { supabaseResponse, user, statoOperativo };
}
