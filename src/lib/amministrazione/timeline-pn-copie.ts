import type { AziendaTimelineTipo } from "@/lib/amministrazione/azienda-timeline";
import type { PnAttivitaCollegamento } from "@/lib/promemorie-e-note/mention-tokens";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const TIMELINE_PN_ORIGINI = ["nota", "attivita", "promemoria"] as const;
export type TimelinePnOrigine = (typeof TIMELINE_PN_ORIGINI)[number];

export type TimelinePnCopiaInput = {
  aziendaTipo: AziendaTimelineTipo;
  aziendaId: string;
  origineTipo: TimelinePnOrigine;
  origineId: string;
  occurredAt: string;
  titolo: string;
  testo: string;
};

export function aziendaTipoDaMentionKind(
  kind: string
): AziendaTimelineTipo | null {
  if (kind === "cliente") return "cliente";
  if (kind === "cliente_possibile") return "cliente_possibile";
  if (kind === "fornitore") return "fornitore";
  return null;
}

export function collegamentiAziendaTimeline(
  collegamenti: PnAttivitaCollegamento[]
): Array<{ aziendaTipo: AziendaTimelineTipo; aziendaId: string }> {
  const seen = new Set<string>();
  const out: Array<{ aziendaTipo: AziendaTimelineTipo; aziendaId: string }> =
    [];
  for (const c of collegamenti) {
    const tipo = aziendaTipoDaMentionKind(c.kind);
    if (!tipo || !c.entityId) continue;
    const key = `${tipo}:${c.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ aziendaTipo: tipo, aziendaId: c.entityId });
  }
  return out;
}

export async function upsertTimelinePnCopia(
  supabase: Supabase,
  userId: string,
  input: TimelinePnCopiaInput
): Promise<string | null> {
  const occurredAt = input.occurredAt.trim();
  if (!occurredAt) return null;
  const titolo = input.titolo.trim() || etichettaOrigine(input.origineTipo);
  const testo = input.testo.trim();

  const { data: existing } = await supabase
    .from("azienda_timeline_pn_copie")
    .select("id, versione")
    .eq("azienda_tipo", input.aziendaTipo)
    .eq("azienda_id", input.aziendaId)
    .eq("origine_tipo", input.origineTipo)
    .eq("origine_id", input.origineId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("azienda_timeline_pn_copie")
      .update({
        occurred_at: occurredAt,
        titolo,
        testo,
        versione: Number(existing.versione ?? 1) + 1,
        updated_by: userId,
      })
      .eq("id", existing.id);
    if (error) return null;
    return String(existing.id);
  }

  const { data, error } = await supabase
    .from("azienda_timeline_pn_copie")
    .insert({
      azienda_tipo: input.aziendaTipo,
      azienda_id: input.aziendaId,
      origine_tipo: input.origineTipo,
      origine_id: input.origineId,
      occurred_at: occurredAt,
      titolo,
      testo,
      documento_stato: "approvato",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return String(data.id);
}

export async function syncTimelinePnCopieDaCollegamenti(input: {
  supabase: Supabase;
  userId: string;
  origineTipo: TimelinePnOrigine;
  origineId: string;
  occurredAt: string;
  titolo: string;
  testo: string;
  collegamenti: PnAttivitaCollegamento[];
}): Promise<number> {
  const target = collegamentiAziendaTimeline(input.collegamenti);
  let n = 0;
  for (const t of target) {
    const id = await upsertTimelinePnCopia(input.supabase, input.userId, {
      aziendaTipo: t.aziendaTipo,
      aziendaId: t.aziendaId,
      origineTipo: input.origineTipo,
      origineId: input.origineId,
      occurredAt: input.occurredAt,
      titolo: input.titolo,
      testo: input.testo,
    });
    if (id) n += 1;
  }
  return n;
}

function etichettaOrigine(tipo: TimelinePnOrigine): string {
  if (tipo === "attivita") return "Attività";
  if (tipo === "promemoria") return "Promemoria";
  return "Nota";
}
