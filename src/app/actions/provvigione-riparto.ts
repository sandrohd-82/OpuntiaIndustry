"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import { parseProvvigionePctInput } from "@/lib/auth/commerciale";
import { createServiceClient } from "@/lib/supabase/server";

export async function listIntermediariProfessionalAction(
  professionalUserId: string
): Promise<
  | {
      success: true;
      grado: "professional" | "altro";
      quotaProfessional: number | null;
      intermediari: { id: string; nome: string }[];
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const userId = professionalUserId.trim();
  if (!userId) {
    return {
      success: true,
      grado: "altro",
      quotaProfessional: null,
      intermediari: [],
    };
  }
  const supabase = createServiceClient();
  const { data: professional } = await supabase
    .from("organigramma_persone")
    .select("id, commerciale_grado, provvigione_quota_superiore_pct")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (
    (professional as { commerciale_grado?: string } | null)?.commerciale_grado !==
    "professional"
  ) {
    return {
      success: true,
      grado: "altro",
      quotaProfessional: null,
      intermediari: [],
    };
  }
  const quota = parseProvvigionePctInput(
    (professional as { provvigione_quota_superiore_pct?: number | null })
      .provvigione_quota_superiore_pct
  );
  const { data: figli } = await supabase
    .from("organigramma_persone")
    .select("user_id, nome, cognome, commerciale_grado")
    .eq("parent_id", (professional as { id: string }).id)
    .eq("commerciale_grado", "executive")
    .is("deleted_at", null);
  const intermediari = (figli ?? [])
    .map((r) => {
      const row = r as {
        user_id?: string | null;
        nome?: string;
        cognome?: string;
      };
      if (!row.user_id) return null;
      return {
        id: row.user_id,
        nome: `${row.cognome ?? ""} ${row.nome ?? ""}`.trim(),
      };
    })
    .filter((r): r is { id: string; nome: string } => Boolean(r));
  return {
    success: true,
    grado: "professional",
    quotaProfessional: quota.ok ? quota.value : null,
    intermediari,
  };
}
