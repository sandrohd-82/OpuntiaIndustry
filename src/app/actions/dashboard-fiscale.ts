"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  calcolaIvaSummary,
  calcolaUtileEStime,
  mesiNelPeriodo,
  resolveFiscalPeriodo,
  type FiscalIvaSummary,
  type FiscalPeriodo,
  type FiscalUtileStima,
  type ScadenzaUnificata,
} from "@/lib/amministrazione/fiscal-dashboard";
import {
  mapCompanyFiscalProfileRow,
  type CompanyFiscalProfile,
} from "@/lib/amministrazione/fiscal-profile";
import { includeInContabilitaFatturaEmessa } from "@/lib/amministrazione/fatture";
import { fatturaDetailPath } from "@/lib/amministrazione/fatture-storico";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type {
  AdempimentoFiscaleInsert,
  AdempimentoFiscaleRow,
  CompanyFiscalProfileRow,
  DashboardFiscaleSnapshotRow,
  FatturaEmessaDilazioneRow,
  FatturaEmessaRow,
  FatturaRicevutaDilazioneRow,
  FatturaRicevutaRow,
} from "@/types/database";

export type DashboardFiscaleSummary = {
  periodo: FiscalPeriodo;
  profile: CompanyFiscalProfile;
  iva: FiscalIvaSummary;
  utile: FiscalUtileStima;
  conteggi: {
    fattureEmesse: number;
    fattureRicevute: number;
  };
};

async function loadProfile(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<CompanyFiscalProfile | null> {
  const { data } = await supabase
    .from("company_fiscal_profile")
    .select("*")
    .eq("company_key", "default")
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return mapCompanyFiscalProfileRow(data as CompanyFiscalProfileRow);
}

export async function getDashboardFiscaleSummaryAction(input: {
  tipo: "mese" | "trimestre";
  anno?: number;
  mese?: number;
}): Promise<
  | { success: true; data: DashboardFiscaleSummary }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  if (!profile) {
    return {
      success: false,
      error:
        "Profilo fiscale assente. Esegui la migrazione e configura Impostazioni → Profilo fiscale.",
    };
  }

  const periodo = resolveFiscalPeriodo({
    tipo: input.tipo,
    anno: input.anno,
    mese: input.mese,
  });

  const { data: emesse, error: eErr } = await supabase
    .from("fatture_emesse")
    .select(
      "id, imponibile, imposta, data_emissione, tipo_documento, stato_pagamento, fattura_collegata_id"
    )
    .is("deleted_at", null)
    .gte("data_emissione", periodo.dal)
    .lte("data_emissione", periodo.al);
  if (eErr) return { success: false, error: eErr.message };

  const { data: ricevute, error: rErr } = await supabase
    .from("fatture_ricevute")
    .select("id, imponibile, imposta, data_emissione")
    .is("deleted_at", null)
    .gte("data_emissione", periodo.dal)
    .lte("data_emissione", periodo.al);
  if (rErr) return { success: false, error: rErr.message };

  const emesseRows = (
    (emesse ?? []) as Array<{
      id: string;
      imponibile: number;
      imposta: number;
      tipo_documento?: string | null;
      stato_pagamento?: string | null;
      fattura_collegata_id?: string | null;
    }>
  ).filter((r) => includeInContabilitaFatturaEmessa(r));
  const ricevuteRows = (ricevute ?? []) as Array<{
    id: string;
    imponibile: number;
    imposta: number;
  }>;

  const imponibileEmesso = emesseRows.reduce(
    (s, r) => s + (Number(r.imponibile) || 0),
    0
  );
  const impostaEmesse = emesseRows.reduce(
    (s, r) => s + (Number(r.imposta) || 0),
    0
  );
  const imponibileRicevuto = ricevuteRows.reduce(
    (s, r) => s + (Number(r.imponibile) || 0),
    0
  );
  const impostaRicevute = ricevuteRows.reduce(
    (s, r) => s + (Number(r.imposta) || 0),
    0
  );

  const iva = calcolaIvaSummary({
    profile,
    impostaEmesse,
    imponibileRicevute: imponibileRicevuto,
    impostaRicevute,
  });
  const utile = calcolaUtileEStime({
    profile,
    imponibileEmesso,
    imponibileRicevuto,
    mesiNelPeriodo: mesiNelPeriodo(periodo.dal, periodo.al),
  });

  return {
    success: true,
    data: {
      periodo,
      profile,
      iva,
      utile,
      conteggi: {
        fattureEmesse: emesseRows.length,
        fattureRicevute: ricevuteRows.length,
      },
    },
  };
}

export async function getDashboardFiscaleScadenzarioAction(input?: {
  dal?: string;
  al?: string;
}): Promise<
  | { success: true; scadenze: ScadenzaUnificata[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const now = new Date();
  const dal =
    input?.dal ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const al =
    input?.al ??
    `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  const scadenze: ScadenzaUnificata[] = [];

  const { data: emesse } = await supabase
    .from("fatture_emesse")
    .select(
      "id, numero_interno, data_emissione, totale, stato_pagamento, cliente_ragione_sociale, tipo_documento, fattura_collegata_id"
    )
    .is("deleted_at", null);
  const emesseRows = ((emesse ?? []) as FatturaEmessaRow[]).filter((r) =>
    includeInContabilitaFatturaEmessa(r)
  );
  const emesseIds = emesseRows.map((r) => r.id);
  const emesseById = new Map(emesseRows.map((r) => [r.id, r]));

  if (emesseIds.length > 0) {
    const { data: dil } = await supabase
      .from("fatture_emesse_dilazioni")
      .select("*")
      .in("fattura_id", emesseIds)
      .is("deleted_at", null)
      .gte("data_scadenza", dal)
      .lte("data_scadenza", al);
    for (const d of (dil ?? []) as FatturaEmessaDilazioneRow[]) {
      const f = emesseById.get(d.fattura_id);
      if (!f) continue;
      if (f.stato_pagamento === "annullata") continue;
      if (d.stato_pagamento === "annullata") continue;
      scadenze.push({
        id: `inc-${d.id}`,
        data: d.data_scadenza,
        tipo: "incasso",
        titolo: `Incasso ${f.numero_interno} — ${f.cliente_ragione_sociale}`,
        importo: Number(d.importo) || 0,
        stato: d.stato_pagamento === "pagato" ? "pagato" : "da_pagare",
        riferimento: f.numero_interno,
        fatturaId: f.id,
        fatturaKind: "emessa",
      });
    }
  }

  // Fallback: fatture emesse da_pagare senza dilazioni → data emissione
  for (const f of emesseRows) {
    if (f.stato_pagamento !== "da_pagare") continue;
    if (f.data_emissione < dal || f.data_emissione > al) continue;
    const hasDil = scadenze.some(
      (s) => s.fatturaId === f.id && s.tipo === "incasso"
    );
    if (hasDil) continue;
    scadenze.push({
      id: `inc-h-${f.id}`,
      data: f.data_emissione,
      tipo: "incasso",
      titolo: `Incasso (testata) ${f.numero_interno}`,
      importo: Number(f.totale) || 0,
      stato: "da_pagare",
      riferimento: f.numero_interno,
      fatturaId: f.id,
      fatturaKind: "emessa",
    });
  }

  const { data: ricevute } = await supabase
    .from("fatture_ricevute")
    .select(
      "id, numero_interno, data_emissione, totale, stato_pagamento, fornitore_ragione_sociale"
    )
    .is("deleted_at", null);
  const ricevuteRows = (ricevute ?? []) as FatturaRicevutaRow[];
  const ricevuteIds = ricevuteRows.map((r) => r.id);
  const ricevuteById = new Map(ricevuteRows.map((r) => [r.id, r]));

  if (ricevuteIds.length > 0) {
    const { data: dil } = await supabase
      .from("fatture_ricevute_dilazioni")
      .select("*")
      .in("fattura_id", ricevuteIds)
      .is("deleted_at", null)
      .gte("data_scadenza", dal)
      .lte("data_scadenza", al);
    for (const d of (dil ?? []) as FatturaRicevutaDilazioneRow[]) {
      const f = ricevuteById.get(d.fattura_id);
      if (!f) continue;
      if (d.stato_pagamento === "annullata") continue;
      scadenze.push({
        id: `pag-${d.id}`,
        data: d.data_scadenza,
        tipo: "pagamento",
        titolo: `Pagamento ${f.numero_interno} — ${f.fornitore_ragione_sociale}`,
        importo: Number(d.importo) || 0,
        stato: d.stato_pagamento === "pagato" ? "pagato" : "da_pagare",
        riferimento: f.numero_interno,
        fatturaId: f.id,
        fatturaKind: "ricevuta",
      });
    }
  }

  for (const f of ricevuteRows) {
    if (f.stato_pagamento !== "da_pagare") continue;
    if (f.data_emissione < dal || f.data_emissione > al) continue;
    const hasDil = scadenze.some(
      (s) => s.fatturaId === f.id && s.tipo === "pagamento"
    );
    if (hasDil) continue;
    scadenze.push({
      id: `pag-h-${f.id}`,
      data: f.data_emissione,
      tipo: "pagamento",
      titolo: `Pagamento (testata) ${f.numero_interno}`,
      importo: Number(f.totale) || 0,
      stato: "da_pagare",
      riferimento: f.numero_interno,
      fatturaId: f.id,
      fatturaKind: "ricevuta",
    });
  }

  const { data: adempimenti } = await supabase
    .from("adempimenti_fiscali")
    .select("*")
    .is("deleted_at", null)
    .eq("attivo", true);
  const start = new Date(dal + "T00:00:00");
  const endDate = new Date(al + "T00:00:00");
  for (const a of (adempimenti ?? []) as AdempimentoFiscaleRow[]) {
    const giorno = a.giorno_mese ?? 16;
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= endDate) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      if (a.ricorrenza === "annuale" && a.mese_anno && a.mese_anno !== m) {
        cursor = new Date(y, cursor.getMonth() + 1, 1);
        continue;
      }
      if (a.ricorrenza === "trimestrale" && ![1, 4, 7, 10].includes(m)) {
        cursor = new Date(y, cursor.getMonth() + 1, 1);
        continue;
      }
      const lastDay = new Date(y, m, 0).getDate();
      const day = Math.min(giorno, lastDay);
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (iso >= dal && iso <= al) {
        scadenze.push({
          id: `ade-${a.id}-${iso}`,
          data: iso,
          tipo: "adempimento",
          titolo: a.titolo,
          importo: null,
          stato: "previsto",
          riferimento: a.codice || a.categoria,
        });
      }
      cursor = new Date(y, cursor.getMonth() + 1, 1);
      if (a.ricorrenza === "una_tantum") break;
    }
  }

  scadenze.sort((a, b) => a.data.localeCompare(b.data));
  return { success: true, scadenze };
}

export type AdempimentoFiscale = {
  id: string;
  codice: string;
  titolo: string;
  descrizione: string;
  categoria: AdempimentoFiscaleRow["categoria"];
  ricorrenza: AdempimentoFiscaleRow["ricorrenza"];
  giornoMese: number | null;
  meseAnno: number | null;
  attivo: boolean;
};

function mapAdempimento(row: AdempimentoFiscaleRow): AdempimentoFiscale {
  return {
    id: row.id,
    codice: row.codice,
    titolo: row.titolo,
    descrizione: row.descrizione,
    categoria: row.categoria,
    ricorrenza: row.ricorrenza,
    giornoMese: row.giorno_mese,
    meseAnno: row.mese_anno,
    attivo: row.attivo,
  };
}

export async function listAdempimentiFiscaliAction(): Promise<
  | { success: true; items: AdempimentoFiscale[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("adempimenti_fiscali")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as AdempimentoFiscaleRow[]).map(mapAdempimento),
  };
}

const adempimentoSchema = z.object({
  titolo: z.string().trim().min(1),
  codice: z.string().optional(),
  descrizione: z.string().optional(),
  categoria: z.enum(["iva", "inps", "ires", "irap", "f24", "altro"]),
  ricorrenza: z.enum(["mensile", "trimestrale", "annuale", "una_tantum"]),
  giornoMese: z.number().int().min(1).max(31).nullable().optional(),
  meseAnno: z.number().int().min(1).max(12).nullable().optional(),
  attivo: z.boolean().optional(),
});

export async function upsertAdempimentoFiscaleAction(
  input: z.infer<typeof adempimentoSchema> & { id?: string }
): Promise<
  | { success: true; item: AdempimentoFiscale }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = adempimentoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validazione fallita.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const payload: AdempimentoFiscaleInsert = {
    titolo: v.titolo.trim(),
    codice: (v.codice ?? "").trim(),
    descrizione: (v.descrizione ?? "").trim(),
    categoria: v.categoria,
    ricorrenza: v.ricorrenza,
    giorno_mese: v.giornoMese ?? null,
    mese_anno: v.meseAnno ?? null,
    attivo: v.attivo ?? true,
    updated_by: auth.userId,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("adempimenti_fiscali")
      .update(payload)
      .eq("id", input.id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Update fallito." };
    }
    return { success: true, item: mapAdempimento(data as AdempimentoFiscaleRow) };
  }

  const { data, error } = await supabase
    .from("adempimenti_fiscali")
    .insert({ ...payload, created_by: auth.userId })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert fallito." };
  }
  return { success: true, item: mapAdempimento(data as AdempimentoFiscaleRow) };
}

export async function softDeleteAdempimentoFiscaleAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { error } = await supabase
    .from("adempimenti_fiscali")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
      attivo: false,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function saveDashboardFiscaleSnapshotAction(input: {
  summary: DashboardFiscaleSummary;
  note?: string;
}): Promise<
  | { success: true; id: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dashboard_fiscale_snapshots")
    .insert({
      periodo_tipo: input.summary.periodo.tipo,
      periodo_label: input.summary.periodo.label,
      periodo_dal: input.summary.periodo.dal,
      periodo_al: input.summary.periodo.al,
      profilo_versione: input.summary.profile.versione,
      note: (input.note ?? "").trim(),
      payload: {
        iva: input.summary.iva,
        utile: input.summary.utile,
        conteggi: input.summary.conteggi,
        profile: {
          formaGiuridica: input.summary.profile.formaGiuridica,
          regimeIva: input.summary.profile.regimeIva,
          versione: input.summary.profile.versione,
        },
        consultedAt: new Date().toISOString(),
      },
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Snapshot non salvato." };
  }

  await writeAuditLog({
    entity_type: "dashboard_fiscale_snapshots",
    entity_id: data.id as string,
    action: "create",
    actor_id: auth.userId,
    summary: `Snapshot fiscale ${input.summary.periodo.label}`,
    payload: {
      periodo: input.summary.periodo,
      profilo_versione: input.summary.profile.versione,
    },
  });

  return { success: true, id: data.id as string };
}

export async function listDashboardFiscaleSnapshotsAction(): Promise<
  | {
      success: true;
      items: Array<{
        id: string;
        periodoLabel: string;
        createdAt: string;
        createdBy: string | null;
        profiloVersione: number;
      }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dashboard_fiscale_snapshots")
    .select("id, periodo_label, created_at, created_by, profilo_versione")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as DashboardFiscaleSnapshotRow[]).map((r) => ({
      id: r.id,
      periodoLabel: r.periodo_label,
      createdAt: r.created_at,
      createdBy: r.created_by,
      profiloVersione: r.profilo_versione,
    })),
  };
}

export { fatturaDetailPath };
