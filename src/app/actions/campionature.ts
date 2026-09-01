"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  createCampionaturaSchema,
  formatNumeroCampionatura,
  type Campionatura,
  type CampionaturaRiga,
} from "@/lib/amministrazione/campionature";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { CampionaturaRigaRow, CampionaturaRow } from "@/types/database";

async function requireCampionaturaAccess(mode: "read" | "write") {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { ok: false as const, error: "Non autenticato" };
  }
  if (isSuperadminProfile(auth.profile)) {
    return { ok: true as const, auth };
  }
  const writeOk =
    userCanAccessArea(auth.areas, "amministrazione") ||
    userCanAccessArea(auth.areas, "produzione");
  const readOk =
    writeOk || userCanAccessArea(auth.areas, "magazzino");
  if (mode === "write" ? !writeOk : !readOk) {
    return { ok: false as const, error: "Permesso negato" };
  }
  return { ok: true as const, auth };
}

function mapRiga(row: CampionaturaRigaRow): CampionaturaRiga {
  return {
    id: row.id,
    prodottoId: row.prodotto_id ?? "",
    prodottoCodice: row.prodotto_codice,
    prodottoNome: row.prodotto_nome,
    quantita: Number(row.quantita),
    unitaMisura: row.unita_misura,
    lottoCodice: row.lotto_codice,
    note: row.note,
  };
}

function mapCampionatura(
  row: CampionaturaRow,
  righe: CampionaturaRigaRow[]
): Campionatura {
  return {
    id: row.id,
    numeroInterno: row.numero_interno,
    clienteId: row.cliente_id ?? "",
    cliente: row.cliente_ragione_sociale,
    clienteCodiceTarga: row.cliente_codice_targa,
    dataInvio: row.data_invio,
    destinatario: row.destinatario,
    indirizzoSpedizione: row.indirizzo_spedizione,
    note: row.note,
    stato: row.stato,
    documentoStato: row.documento_stato,
    versione: row.versione,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    righe: righe
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapRiga),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function nextSeq(targa: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campionature")
    .select("numero_interno")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const code = targa.trim().toUpperCase().replace(/\s+/g, "");
  const re = new RegExp(
    `^Cp-\\d{2}-${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.numero_interno).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export async function listCampionatureAction(): Promise<
  { success: true; items: Campionatura[] } | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("read");
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campionature")
    .select("*")
    .is("deleted_at", null)
    .order("data_invio", { ascending: false })
    .limit(200);
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as CampionaturaRow[];
  const ids = rows.map((r) => r.id);
  const righeByParent = new Map<string, CampionaturaRigaRow[]>();
  if (ids.length) {
    const { data: righe } = await supabase
      .from("campionature_righe")
      .select("*")
      .in("campionatura_id", ids);
    for (const r of (righe ?? []) as CampionaturaRigaRow[]) {
      const list = righeByParent.get(r.campionatura_id) ?? [];
      list.push(r);
      righeByParent.set(r.campionatura_id, list);
    }
  }
  return {
    success: true,
    items: rows.map((r) => mapCampionatura(r, righeByParent.get(r.id) ?? [])),
  };
}

export async function createCampionaturaAction(
  raw: unknown
): Promise<
  { success: true; item: Campionatura } | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("write");
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = createCampionaturaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const input = parsed.data;
  const now = new Date().toISOString();
  const seq = await nextSeq(input.codiceTargaCliente);
  const numero = formatNumeroCampionatura(
    input.dataInvio,
    input.codiceTargaCliente,
    seq
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campionature")
    .insert({
      numero_interno: numero,
      cliente_id: input.clienteId,
      cliente_ragione_sociale: input.cliente,
      cliente_codice_targa: input.codiceTargaCliente.trim().toUpperCase(),
      data_invio: input.dataInvio,
      destinatario: input.destinatario || input.cliente,
      indirizzo_spedizione: input.indirizzoSpedizione,
      note: input.note,
      stato: "inviata",
      documento_stato: "approvato",
      versione: 1,
      approved_at: now,
      approved_by: gate.auth.userId,
      sent_at: now,
      sent_by: gate.auth.userId,
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Inserimento fallito" };
  }
  const header = data as CampionaturaRow;

  const { data: righe, error: rErr } = await supabase
    .from("campionature_righe")
    .insert(
      input.righe.map((r, i) => ({
        campionatura_id: header.id,
        prodotto_id: r.prodottoId,
        prodotto_codice: r.prodottoCodice,
        prodotto_nome: r.prodottoNome,
        quantita: r.quantita,
        unita_misura: r.unitaMisura,
        lotto_codice: r.lottoCodice,
        note: r.note ?? "",
        sort_order: i,
        created_by: gate.auth.userId,
        updated_by: gate.auth.userId,
      }))
    )
    .select("*");

  if (rErr) {
    await supabase
      .from("campionature")
      .update({
        deleted_at: now,
        deleted_by: gate.auth.userId,
      })
      .eq("id", header.id);
    return { success: false, error: rErr.message };
  }

  await writeAuditLog({
    entity_type: "campionature",
    entity_id: header.id,
    action: "create",
    actor_id: gate.auth.userId,
    summary: `Campionatura ${numero} inviata a ${input.cliente}`,
    payload: {
      numero_interno: numero,
      cliente_id: input.clienteId,
      lotti: input.righe.map((r) => r.lottoCodice),
    },
  });

  return {
    success: true,
    item: mapCampionatura(header, (righe ?? []) as CampionaturaRigaRow[]),
  };
}

export async function previewNumeroCampionaturaAction(input: {
  codiceTargaCliente: string;
  dataInvio: string;
}): Promise<
  { success: true; numeroInterno: string } | { success: false; error: string }
> {
  const gate = await requireCampionaturaAccess("read");
  if (!gate.ok) return { success: false, error: gate.error };
  try {
    const seq = await nextSeq(input.codiceTargaCliente);
    return {
      success: true,
      numeroInterno: formatNumeroCampionatura(
        input.dataInvio,
        input.codiceTargaCliente,
        seq
      ),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Anteprima numero non disponibile",
    };
  }
}

export async function softDeleteCampionaturaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireCampionaturaAccess("write");
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from("campionature")
    .select("id, numero_interno, versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !existing) {
    return { success: false, error: readErr?.message ?? "Record non trovato" };
  }
  const { error } = await supabase
    .from("campionature")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: gate.auth.userId,
      updated_by: gate.auth.userId,
      versione: (existing.versione ?? 1) + 1,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "campionature",
    entity_id: id,
    action: "soft_delete",
    actor_id: gate.auth.userId,
    summary: `Campionatura ${existing.numero_interno} archiviata (soft delete)`,
  });
  return { success: true };
}
