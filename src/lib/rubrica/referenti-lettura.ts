import { createClient } from "@/lib/supabase/server";
import type { RubricaContatto } from "@/lib/rubrica/types";
import {
  CONTATTO_SELECT,
  guardRubricaAnagrafica,
  junctionFor,
  mapContatto,
  type EntityReferentiTipo,
} from "@/lib/rubrica/anagrafica-comune";

export async function leggiReferentiAnagrafica(input: {
  tipo: EntityReferentiTipo;
  entityId: string;
}): Promise<
  { success: true; items: RubricaContatto[] } | { success: false; error: string }
> {
  await guardRubricaAnagrafica();
  const j = junctionFor(input.tipo);
  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from(j.table)
    .select("contatto_id")
    .eq(j.fk, input.entityId);
  if (error) return { success: false, error: error.message };
  const ids = (links ?? []).map((r) => String(r.contatto_id));
  if (ids.length === 0) return { success: true, items: [] };
  const { data: contatti, error: e3 } = await supabase
    .from("rubrica_contatti")
    .select(CONTATTO_SELECT)
    .in("id", ids)
    .is("deleted_at", null);
  if (e3) return { success: false, error: e3.message };
  return {
    success: true,
    items: (contatti ?? []).map((r) =>
      mapContatto(r as Record<string, unknown>)
    ),
  };
}
