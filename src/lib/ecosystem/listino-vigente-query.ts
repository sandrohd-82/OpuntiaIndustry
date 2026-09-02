import { createClient } from "@/lib/supabase/server";
import {
  mapDisponibilitaVoce,
  type ListinoVoceVigente,
} from "@/lib/ecosystem/listino-vigente";

export async function queryListinoVoceVigente(
  prodottoId: string
): Promise<{ voce: ListinoVoceVigente | null; error?: string }> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: listini, error: lErr } = await supabase
    .from("listini")
    .select("id")
    .eq("stato", "in_uso")
    .eq("canale", "b2b")
    .is("deleted_at", null)
    .lte("valido_dal", today);
  if (lErr) return { voce: null, error: lErr.message };
  const ids = ((listini ?? []) as { id: string }[]).map((l) => l.id);
  if (!ids.length) return { voce: null };

  const { data, error } = await supabase
    .from("listini_righe")
    .select("listino_id, prezzo, iva_percentuale, disponibilita, unita_misura")
    .eq("prodotto_id", prodottoId)
    .in("listino_id", ids)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) return { voce: null, error: error.message };
  if (!data) return { voce: null };
  const vr = data as {
    listino_id: string;
    prezzo: number;
    iva_percentuale: number;
    disponibilita?: string;
    unita_misura?: string;
  };
  return {
    voce: {
      listinoId: vr.listino_id,
      prezzo: Number(vr.prezzo),
      iva: Number(vr.iva_percentuale ?? 22),
      disponibilita: mapDisponibilitaVoce(vr.disponibilita),
      unitaMisura: vr.unita_misura === "lt" ? "lt" : "kg",
    },
  };
}
