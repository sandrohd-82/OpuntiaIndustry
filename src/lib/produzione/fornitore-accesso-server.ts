import { createClient } from "@/lib/supabase/server";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";
import {
  risolviAccessoMaterialeIngresso,
  type EsitoAccessoFornitore,
  type SoggettoAccessoFornitore,
} from "@/lib/produzione/fornitore-accesso";

export async function soggettoAccessoFornitore(): Promise<SoggettoAccessoFornitore | null> {
  const auth = await getAuthContext();
  if (!auth) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori_accessi")
    .select("fornitore_id")
    .eq("profile_id", auth.userId)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    superadmin: isUnrestrictedSuperadmin(auth),
    aree: auth.areas.map((area) => area.slug),
    fornitoreCollegatoId: error ? null : (data?.fornitore_id ?? null),
  };
}

export async function contestoMaterialeIngresso(
  fornitoreRichiestoId: string | null
): Promise<EsitoAccessoFornitore> {
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto) return { esito: "negato", motivo: "area_assente" };
  return risolviAccessoMaterialeIngresso(soggetto, fornitoreRichiestoId);
}
