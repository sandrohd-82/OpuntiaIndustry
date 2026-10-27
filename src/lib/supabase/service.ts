import { cache } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client service role, senza cookie e senza next/headers.
 * Così i moduli condivisi col browser non trascinano il server delle pagine.
 */
export const createServiceClient = cache(function createServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error("Il client di servizio non è disponibile nel browser.");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase service env vars");
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
});
