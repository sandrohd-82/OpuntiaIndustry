import { todayIsoDate } from "@/lib/amministrazione/documentazioni";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function markDocumentazioniScadute(
  supabase: Client,
  actorId: string | null
): Promise<{ ok: true; marked: number } | { ok: false; error: string }> {
  const today = todayIsoDate();
  const { data, error } = await supabase
    .from("documentazioni_aziendali")
    .update({
      stato_operativo: "scaduto",
      updated_by: actorId,
    })
    .is("deleted_at", null)
    .is("archiviato_at", null)
    .neq("stato_operativo", "scaduto")
    .lt("data_scadenza", today)
    .select("id, codice");

  if (error) return { ok: false, error: error.message };
  const rows = data ?? [];
  if (rows.length > 0) {
    const { error: auditErr } = await supabase.from("audit_log").insert(
      (rows as Array<{ id: string; codice: string }>).map((row) => ({
        entity_type: "documentazioni_aziendali",
        entity_id: row.id,
        action: "status_change",
        actor_id: actorId,
        summary: `Documentazione ${row.codice} passata a Scaduto (data scadenza superata)`,
        payload: { codice: row.codice, dataScadenzaRif: today },
      }))
    );
    if (auditErr) {
      console.error("[documentazioni scadute audit]", auditErr.message);
    }
  }
  return { ok: true, marked: rows.length };
}
