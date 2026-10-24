import { createServiceClient } from "@/lib/supabase/server";

/** Chiude la prenotazione del numero quando l'ordine viene eliminato. Non tocca un numero già emesso e non sposta il contatore fiscale. */
export async function rilasciaPrenotazioniOrdine(
  ordineId: string,
  userId: string | null
): Promise<void> {
  if (!ordineId) return;
  const service = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("fatture_numeri_prenotati")
    .update({
      stato: "rilasciata",
      rilasciata_at: now,
      deleted_at: now,
      deleted_by: userId,
      updated_at: now,
      updated_by: userId,
    })
    .eq("ordine_id", ordineId)
    .in("stato", ["in_corso", "aggiudicata"])
    .is("deleted_at", null)
    .select("id, numero_fattura");
  if (error) throw new Error(error.message);
  const righe = (data ?? []) as Array<{ id: string; numero_fattura: string }>;
  if (righe.length === 0) return;
  const { error: auditError } = await service.from("audit_log").insert(
    righe.map((riga) => ({
      entity_type: "fatture_numeri_prenotati",
      entity_id: riga.id,
      action: "soft_delete",
      actor_id: userId,
      summary: `Numero ${riga.numero_fattura} rilasciato: ordine eliminato.`,
      payload: {
        numero_fattura: riga.numero_fattura,
        motivo: "ordine_eliminato",
        ordine_id: ordineId,
      },
    }))
  );
  if (auditError) throw new Error(auditError.message);
}
