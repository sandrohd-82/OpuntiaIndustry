"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireOrdineReadAccess } from "@/lib/auth/ordini-access";
import {
  noteSezioniDaInput,
  ORDINE_SEZIONE_CHIAVI,
  type NoteSezioniOrdine,
  type OrdineSezioneChiave,
} from "@/lib/amministrazione/ordine-sezione-note";
import { createClient } from "@/lib/supabase/server";

export async function leggiNoteSezioniOrdineAction(
  ordineId: string
): Promise<
  { success: true; note: NoteSezioniOrdine } | { success: false; error: string }
> {
  await requireOrdineReadAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordine_sezione_note")
    .select("sezione_chiave, testo")
    .eq("ordine_id", ordineId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const note: NoteSezioniOrdine = {};
  for (const row of data ?? []) {
    const chiave = String(row.sezione_chiave ?? "") as OrdineSezioneChiave;
    if (!(ORDINE_SEZIONE_CHIAVI as readonly string[]).includes(chiave)) continue;
    const testo = String(row.testo ?? "").trim();
    if (testo) note[chiave] = testo;
  }
  return { success: true, note };
}

export async function salvaNoteSezioniOrdine(input: {
  ordineId: string;
  userId: string;
  note: unknown;
}): Promise<{ success: true } | { success: false; error: string }> {
  const volute = noteSezioniDaInput(input.note);
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: esistenti, error: readErr } = await supabase
    .from("ordine_sezione_note")
    .select("id, sezione_chiave, testo, versione, deleted_at")
    .eq("ordine_id", input.ordineId);
  if (readErr) return { success: false, error: readErr.message };

  const perChiave = new Map<
    string,
    { id: string; testo: string; versione: number; deleted_at: string | null }
  >();
  for (const row of esistenti ?? []) {
    const chiave = String(row.sezione_chiave);
    const viva = !row.deleted_at;
    if (perChiave.has(chiave) && !viva) continue;
    perChiave.set(chiave, {
      id: String(row.id),
      testo: String(row.testo ?? ""),
      versione: Number(row.versione ?? 1),
      deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    });
  }

  const toccate: string[] = [];
  for (const chiave of ORDINE_SEZIONE_CHIAVI) {
    const testo = volute[chiave] ?? "";
    const gia = perChiave.get(chiave);
    if (!testo) {
      if (gia && !gia.deleted_at) {
        const { error } = await supabase
          .from("ordine_sezione_note")
          .update({
            deleted_at: now,
            deleted_by: input.userId,
            updated_by: input.userId,
            updated_at: now,
          })
          .eq("id", gia.id);
        if (error) return { success: false, error: error.message };
        toccate.push(chiave);
      }
      continue;
    }
    if (gia && !gia.deleted_at && gia.testo.trim() === testo) continue;
    if (gia) {
      const { error } = await supabase
        .from("ordine_sezione_note")
        .update({
          testo,
          versione: gia.versione + 1,
          deleted_at: null,
          deleted_by: null,
          updated_by: input.userId,
          updated_at: now,
          documento_stato: "approvato",
        })
        .eq("id", gia.id);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase.from("ordine_sezione_note").insert({
        ordine_id: input.ordineId,
        sezione_chiave: chiave,
        testo,
        versione: 1,
        documento_stato: "approvato",
        created_by: input.userId,
        updated_by: input.userId,
      });
      if (error) return { success: false, error: error.message };
    }
    toccate.push(chiave);
  }

  if (toccate.length) {
    await writeAuditLog({
      entity_type: "ordini",
      entity_id: input.ordineId,
      action: "update",
      actor_id: input.userId,
      summary: "Note di sezione dell'ordine aggiornate",
      payload: { sezioni: toccate },
    });
  }
  return { success: true };
}
