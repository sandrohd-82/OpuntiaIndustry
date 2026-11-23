import { createServiceClient } from "@/lib/supabase/server";
import { RUOLO_FORNITORE } from "@/lib/auth/perimetro-fornitore";

export async function codiceRuoloProfilo(profileId: string): Promise<string> {
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("app_roles(code)")
    .eq("id", profileId)
    .maybeSingle();
  const role = data?.app_roles as { code?: string } | { code?: string }[] | null | undefined;
  const obj = Array.isArray(role) ? role[0] : role;
  return String(obj?.code ?? "");
}

export async function eProfiloFornitore(profileId: string): Promise<boolean> {
  return (await codiceRuoloProfilo(profileId)) === RUOLO_FORNITORE;
}
