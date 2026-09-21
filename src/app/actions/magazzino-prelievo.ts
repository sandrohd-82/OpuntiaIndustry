"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isValidLottoAgrinsicilia } from "@/lib/magazzino/lotto-agrinsicilia";
import {
  formatQuantitaCarico,
  MAGAZZINO_CARICO_UNITA,
  quantitaStockDaCarico,
  segnoQuantitaMovimento,
  type MagazzinoCaricoUnita,
} from "@/lib/magazzino/types";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const CATALOG_PROPRIO = "prodotto_proprio";

const prelevaSchema = z.object({
  prodottoId: z.string().uuid("Seleziona un prodotto"),
  lottoCodice: z
    .string()
    .trim()
    .min(1, "Lotto obbligatorio")
    .refine(isValidLottoAgrinsicilia, "Lotto non valido."),
  quantita: z.number().positive("Quantità maggiore di zero"),
  unitaMisura: z.enum(MAGAZZINO_CARICO_UNITA),
  foglioId: z.string().uuid().optional().nullable(),
  processoId: z.string().uuid().optional().nullable(),
  attivitaId: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(1000).optional().default(""),
});

export async function prelevaQuantitaAgrinsiciliaAction(
  raw: unknown
): Promise<
  | { success: true; movimentoId: string; giacenzaKg: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const parsed = prelevaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati prelievo non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();

  const { data: prodotto, error: pErr } = await supabase
    .from("prodotti_propri")
    .select("id, codice, nome")
    .eq("id", input.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr || !prodotto) {
    return { success: false, error: pErr?.message ?? "Prodotto non trovato." };
  }

  const { data: movs, error: mErr } = await supabase
    .from("magazzino_movimenti")
    .select("tipo, quantita_kg, lotto_esterno_id")
    .eq("catalog_kind", CATALOG_PROPRIO)
    .eq("prodotto_id", input.prodottoId)
    .eq("lotto_codice", input.lottoCodice)
    .is("deleted_at", null);
  if (mErr) return { success: false, error: mErr.message };
  const lottoKg = ((movs ?? []) as Array<{
    tipo: string;
    quantita_kg: number;
  }>).reduce(
    (sum, r) =>
      sum + segnoQuantitaMovimento(r.tipo, Number(r.quantita_kg) || 0),
    0
  );
  const qtyStock = quantitaStockDaCarico(input.quantita, input.unitaMisura);
  if (qtyStock - 1e-9 > lottoKg) {
    return {
      success: false,
      error: `Il lotto ha ${lottoKg.toLocaleString("it-IT")} kg/lt disponibili.`,
    };
  }

  const { data: giac } = await supabase
    .from("magazzino_giacenze")
    .select("id, quantita_kg, unita")
    .eq("catalog_kind", CATALOG_PROPRIO)
    .eq("prodotto_id", input.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  const prima = giac ? Number(giac.quantita_kg) || 0 : 0;
  const dopo = Math.round((prima - qtyStock) * 1000) / 1000;
  if (dopo < -0.0005) {
    return {
      success: false,
      error: "Giacenza prodotto insufficiente per questo prelievo.",
    };
  }

  let foglioId: string | null = input.foglioId ?? null;
  if (foglioId) {
    const { data: foglio } = await supabase
      .from("produzione_fogli_lavorazione")
      .select("id")
      .eq("id", foglioId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!foglio) foglioId = null;
  }

  const lottoEsternoId =
    ((movs ?? []) as Array<{ lotto_esterno_id?: string | null }>)
      .map((m) => m.lotto_esterno_id)
      .find(Boolean) ?? null;

  if (giac?.id) {
    const { error } = await supabase
      .from("magazzino_giacenze")
      .update({
        quantita_kg: dopo,
        updated_by: auth.userId,
      })
      .eq("id", giac.id);
    if (error) return { success: false, error: error.message };
  }

  const { data: mov, error: movErr } = await supabase
    .from("magazzino_movimenti")
    .insert({
      catalog_kind: CATALOG_PROPRIO,
      prodotto_id: input.prodottoId,
      prodotto_codice: prodotto.codice,
      tipo: "scarico",
      quantita_kg: qtyStock,
      unita: input.unitaMisura,
      lotto_codice: input.lottoCodice,
      foglio_id: foglioId,
      motivo_senza_foglio: foglioId ? null : "inventario",
      riferimento: "prelievo-processo",
      note:
        input.note.trim() ||
        (input.processoId
          ? "Prelievo avviato da processo in produzione"
          : "Prelievo magazzino prodotti Agrinsicilia"),
      lotto_esterno_id: lottoEsternoId,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (movErr || !mov) {
    return { success: false, error: movErr?.message ?? "Prelievo non salvato." };
  }

  void writeAuditLog({
    entity_type: "magazzino_movimenti",
    entity_id: mov.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Prelievo ${formatQuantitaCarico(qtyStock, input.unitaMisura)} · ${prodotto.codice} · lotto ${input.lottoCodice}`,
    payload: {
      prodotto_id: input.prodottoId,
      lotto_codice: input.lottoCodice,
      quantita_stock: qtyStock,
      giacenza_prima: prima,
      giacenza_dopo: dopo,
      foglio_id: foglioId,
      processo_id: input.processoId ?? null,
      attivita_id: input.attivitaId ?? null,
    },
  });

  return { success: true, movimentoId: mov.id, giacenzaKg: dopo };
}

export type { MagazzinoCaricoUnita };
