"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { getPublicAppUrl } from "@/lib/auth/app-url";
import { isValidLottoIngressoMp } from "@/lib/produzione/fogli-ingresso-mp";
import {
  composeLottoUscita,
  compositoCreateSchema,
  isoWeekAndYear,
  isValidLottoUscita,
  labelTipoLottoEsterno,
  mergeVisibilita,
  nextSeqFromCodici,
  parseLottoUscita,
  publicLottoUrl,
  VISIBILITA_CHIAVI,
  visibilitaSaveSchema,
  VISIBILITA_DEFAULT,
  type LottoEsterno,
  type LottoEsternoTipo,
  type TimelineEvento,
  type VisibilitaChiave,
} from "@/lib/produzione/lotti-esterni";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

type FoglioLavorazioneTimeline = {
  id: string;
  codice: string;
  started_at: string;
  expected_end_at: string;
  closed_at: string | null;
  prodotto: string;
  lotto_label: string | null;
  lotto_id: string | null;
  codice_prodotto_uscita: string | null;
  created_by: string | null;
  note: string;
  motivo: string;
};

type LottoRow = {
  id: string;
  codice: string;
  tipo: LottoEsternoTipo;
  settimana: number;
  anno: number;
  seq_hex: string;
  foglio_lavorazione_id: string | null;
  prodotto_codice: string | null;
  prodotto_nome: string | null;
  is_composito: boolean;
  versione: number;
  documento_stato: "bozza" | "registrato" | "chiuso";
  public_token: string;
  public_enabled: boolean;
  visibilita: unknown;
  note: string;
  generated_at: string;
};

function newPublicToken(): string {
  return randomBytes(18).toString("hex");
}

function mapLotto(
  r: LottoRow,
  extra?: {
    foglioCodice?: string | null;
    componenti?: LottoEsterno["componenti"];
  }
): LottoEsterno {
  return {
    id: r.id,
    codice: r.codice,
    tipo: r.tipo,
    settimana: r.settimana,
    anno: r.anno,
    seqHex: r.seq_hex,
    foglioLavorazioneId: r.foglio_lavorazione_id,
    foglioCodice: extra?.foglioCodice ?? null,
    prodottoCodice: r.prodotto_codice,
    prodottoNome: r.prodotto_nome,
    isComposito: r.is_composito,
    versione: r.versione,
    documentoStato: r.documento_stato,
    publicToken: r.public_token,
    publicEnabled: r.public_enabled,
    visibilita: mergeVisibilita(r.visibilita),
    note: r.note ?? "",
    generatedAt: r.generated_at,
    componenti: extra?.componenti ?? [],
  };
}

async function loadComponenti(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lottoId: string
): Promise<LottoEsterno["componenti"]> {
  const { data } = await supabase
    .from("lotti_esterni_componenti")
    .select(
      "id, lotto_componente_id, quantita, unita, componente:lotti_esterni!lotto_componente_id(codice)"
    )
    .eq("lotto_composito_id", lottoId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<{
    id: string;
    quantita: number | string | null;
    unita: string;
    componente: { codice: string } | { codice: string }[] | null;
  }>).map((c) => {
    const nested = Array.isArray(c.componente)
      ? c.componente[0]
      : c.componente;
    return {
      id: c.id,
      codice: nested?.codice ?? "—",
      quantita: c.quantita != null ? Number(c.quantita) : null,
      unita: c.unita,
    };
  });
}

async function nextCodiceUscita(
  supabase: Awaited<ReturnType<typeof createClient>>,
  at: Date
): Promise<{ codice: string; week: number; year: number; seqHex: string }> {
  const { week, year } = isoWeekAndYear(at);
  const prefix = `${String(week).padStart(2, "0")}${String(year % 100).padStart(2, "0")}`;
  const { data } = await supabase
    .from("lotti_esterni")
    .select("codice")
    .is("deleted_at", null)
    .like("codice", `${prefix}%`);
  const seq = nextSeqFromCodici(
    ((data ?? []) as Array<{ codice: string }>).map((r) => r.codice),
    prefix
  );
  const codice = composeLottoUscita(week, year, seq);
  return { codice, week, year, seqHex: codice.slice(4) };
}

export async function anteprimaLottoUscitaAction(): Promise<
  | { success: true; codice: string; settimana: number; anno: number }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["strumenti", "produzione", "magazzino"]);
  const supabase = await createClient();
  const next = await nextCodiceUscita(supabase, new Date());
  return {
    success: true,
    codice: next.codice,
    settimana: next.week,
    anno: next.year,
  };
}

export async function creaLottoUscitaAlSalvataggio(input: {
  userId: string;
  codicePreferito?: string | null;
  prodottoNome?: string | null;
  note?: string;
}): Promise<
  | { success: true; lotto: LottoEsterno; codiceCambiato: boolean }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["strumenti", "produzione", "magazzino"]);
  const supabase = await createClient();
  const preferito = (input.codicePreferito ?? "").trim().toUpperCase();
  const preferitoOk = preferito && isValidLottoUscita(preferito);
  const now = new Date().toISOString();
  let lastError = "Creazione lotto in uscita fallita.";

  for (let attempt = 0; attempt < 4; attempt++) {
    const next =
      attempt === 0 && preferitoOk
        ? (() => {
            const p = parseLottoUscita(preferito);
            if (!p) return null;
            return {
              codice: preferito,
              week: p.week,
              year: p.year,
              seqHex: p.seqHex,
            };
          })()
        : await nextCodiceUscita(supabase, new Date());
    if (!next) continue;
    const { data, error } = await supabase
      .from("lotti_esterni")
      .insert({
        codice: next.codice,
        tipo: "prodotto_uscita",
        settimana: next.week,
        anno: next.year,
        seq_hex: next.seqHex,
        foglio_lavorazione_id: null,
        prodotto_nome: input.prodottoNome?.trim() || null,
        is_composito: false,
        versione: 1,
        documento_stato: "registrato",
        public_token: newPublicToken(),
        public_enabled: true,
        visibilita: VISIBILITA_DEFAULT,
        note:
          input.note?.trim() ||
          "Lotto in uscita associato al carico magazzino (inventario).",
        generated_at: now,
        generated_by: input.userId,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .select("*")
      .single();
    if (!error && data) {
      const created = data as LottoRow;
      void writeAuditLog({
        entity_type: "lotti_esterni",
        entity_id: created.id,
        action: "create",
        actor_id: input.userId,
        summary: `Lotto prodotto in uscita ${created.codice} da carico magazzino`,
        payload: {
          codice: created.codice,
          origine: "carico_magazzino",
          codice_preferito: preferito || null,
        },
      });
      return {
        success: true,
        lotto: mapLotto(created),
        codiceCambiato: Boolean(preferitoOk && preferito !== created.codice),
      };
    }
    lastError = error?.message ?? lastError;
    if (error?.code !== "23505") {
      return { success: false, error: lastError };
    }
  }
  return { success: false, error: lastError };
}

export async function ensureLottoUscitaPerFoglio(input: {
  foglioId: string;
  userId: string;
  startedAt?: string;
  prodottoUscita?: string | null;
}): Promise<
  | { success: true; lotto: LottoEsterno; created: boolean }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("lotti_esterni")
    .select("*")
    .eq("foglio_lavorazione_id", input.foglioId)
    .eq("is_composito", false)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    const row = existing as LottoRow;
    return { success: true, lotto: mapLotto(row), created: false };
  }

  const { data: foglio } = await supabase
    .from("produzione_fogli_lavorazione")
    .select("id, codice, started_at, codice_prodotto_uscita, lotto_esterno_id")
    .eq("id", input.foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!foglio) return { success: false, error: "Foglio di lavorazione non trovato." };

  const f = foglio as {
    id: string;
    codice: string;
    started_at: string;
    codice_prodotto_uscita: string | null;
    lotto_esterno_id: string | null;
  };
  if (f.lotto_esterno_id) {
    const { data: linked } = await supabase
      .from("lotti_esterni")
      .select("*")
      .eq("id", f.lotto_esterno_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (linked) {
      return { success: true, lotto: mapLotto(linked as LottoRow), created: false };
    }
  }

  const stamp = new Date(input.startedAt || f.started_at || Date.now());
  const now = new Date().toISOString();
  const prodotto = (input.prodottoUscita || f.codice_prodotto_uscita || "").trim();
  let created: LottoRow | null = null;
  let lastError = "Generazione lotto in uscita fallita.";
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = await nextCodiceUscita(supabase, stamp);
    const { data, error } = await supabase
      .from("lotti_esterni")
      .insert({
        codice: next.codice,
        tipo: "prodotto_uscita",
        settimana: next.week,
        anno: next.year,
        seq_hex: next.seqHex,
        foglio_lavorazione_id: input.foglioId,
        prodotto_nome: prodotto || null,
        is_composito: false,
        versione: 1,
        documento_stato: "registrato",
        public_token: newPublicToken(),
        public_enabled: true,
        visibilita: VISIBILITA_DEFAULT,
        generated_at: now,
        generated_by: input.userId,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .select("*")
      .single();
    if (!error && data) {
      created = data as LottoRow;
      break;
    }
    lastError = error?.message ?? lastError;
    if (error?.code !== "23505") {
      return { success: false, error: lastError };
    }
    const { data: again } = await supabase
      .from("lotti_esterni")
      .select("*")
      .eq("foglio_lavorazione_id", input.foglioId)
      .eq("is_composito", false)
      .is("deleted_at", null)
      .maybeSingle();
    if (again) {
      return { success: true, lotto: mapLotto(again as LottoRow), created: false };
    }
  }
  if (!created) {
    return { success: false, error: lastError };
  }
  await supabase
    .from("produzione_fogli_lavorazione")
    .update({
      lotto_esterno_id: created.id,
      updated_by: input.userId,
      updated_at: now,
    })
    .eq("id", input.foglioId);
  void writeAuditLog({
    entity_type: "lotti_esterni",
    entity_id: created.id,
    action: "create",
    actor_id: input.userId,
    summary: `Lotto prodotto in uscita ${created.codice} sul foglio ${f.codice}`,
    payload: {
      codice: created.codice,
      foglio_id: input.foglioId,
      tipo: "prodotto_uscita",
    },
  });
  return {
    success: true,
    lotto: mapLotto(created, { foglioCodice: f.codice }),
    created: true,
  };
}

export async function generaLottoUscitaFoglioAction(
  foglioId: string
): Promise<
  | { success: true; lotto: LottoEsterno; created: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["strumenti", "produzione"]);
  if (!foglioId) return { success: false, error: "Foglio mancante." };
  return ensureLottoUscitaPerFoglio({ foglioId, userId: auth.userId });
}

export async function listLottiEsterniAction(): Promise<
  | { success: true; items: LottoEsterno[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["strumenti", "produzione"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotti_esterni")
    .select("*")
    .is("deleted_at", null)
    .order("generated_at", { ascending: false })
    .limit(200);
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as LottoRow[];
  const foglioIds = [
    ...new Set(
      rows
        .map((r) => r.foglio_lavorazione_id)
        .filter((x): x is string => Boolean(x))
    ),
  ];
  const { data: fogli } = foglioIds.length
    ? await supabase
        .from("produzione_fogli_lavorazione")
        .select("id, codice")
        .in("id", foglioIds)
    : { data: [] };
  const foglioMap = new Map(
    ((fogli ?? []) as Array<{ id: string; codice: string }>).map((f) => [
      f.id,
      f.codice,
    ])
  );
  const items: LottoEsterno[] = [];
  for (const r of rows) {
    const componenti = r.is_composito
      ? await loadComponenti(supabase, r.id)
      : [];
    items.push(
      mapLotto(r, {
        foglioCodice: r.foglio_lavorazione_id
          ? foglioMap.get(r.foglio_lavorazione_id) ?? null
          : null,
        componenti,
      })
    );
  }
  return { success: true, items };
}

export async function getLottoEsternoByCodiceAction(codice: string): Promise<
  { success: true; lotto: LottoEsterno } | { success: false; error: string }
> {
  await requireAnyAreaAccess(["strumenti", "produzione"]);
  const raw = codice.trim().toUpperCase();
  if (!isValidLottoUscita(raw)) {
    return { success: false, error: "Codice lotto in uscita non valido (10 caratteri SSAA + 6 hex)." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotti_esterni")
    .select("*")
    .eq("codice", raw)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Lotto non trovato." };
  }
  const row = data as LottoRow;
  let foglioCodice: string | null = null;
  if (row.foglio_lavorazione_id) {
    const { data: f } = await supabase
      .from("produzione_fogli_lavorazione")
      .select("codice")
      .eq("id", row.foglio_lavorazione_id)
      .maybeSingle();
    foglioCodice = (f as { codice?: string } | null)?.codice ?? null;
  }
  const componenti = row.is_composito
    ? await loadComponenti(supabase, row.id)
    : [];
  return {
    success: true,
    lotto: mapLotto(row, { foglioCodice, componenti }),
  };
}

export async function updateVisibilitaLottoAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["strumenti", "produzione"]);
  const parsed = visibilitaSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const visibilita = mergeVisibilita(parsed.data.visibilita);
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("lotti_esterni")
    .select("versione")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cur) return { success: false, error: "Lotto non trovato." };
  const { error } = await supabase
    .from("lotti_esterni")
    .update({
      visibilita,
      public_enabled: parsed.data.publicEnabled ?? true,
      note: parsed.data.note ?? "",
      versione: Number((cur as { versione?: number }).versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "lotti_esterni",
    entity_id: parsed.data.id,
    action: "update",
    actor_id: auth.userId,
    summary: "Aggiornata visibilità QR pubblico lotto in uscita",
    payload: { visibilita, keys: VISIBILITA_CHIAVI },
  });
  return { success: true };
}

/** Un lotto di provenienza → si comunica quello. Due o più → lotto inclusivo. */
export async function risolviLottoUscitaPerVenditaAction(
  lottiIds: string[]
): Promise<
  { success: true; lotto: LottoEsterno } | { success: false; error: string }
> {
  await requireAnyAreaAccess(["strumenti", "produzione"]);
  const unique = [...new Set(lottiIds.filter(Boolean))];
  if (unique.length === 0) {
    return { success: false, error: "Nessun lotto di provenienza." };
  }
  if (unique.length === 1) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lotti_esterni")
      .select("*")
      .eq("id", unique[0])
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Lotto non trovato." };
    }
    const row = data as LottoRow;
    const componenti = row.is_composito
      ? await loadComponenti(supabase, row.id)
      : [];
    return { success: true, lotto: mapLotto(row, { componenti }) };
  }
  return creaLottoUscitaCompositoAction({ lottiIds: unique });
}

export async function creaLottoUscitaCompositoAction(
  raw: unknown
): Promise<
  { success: true; lotto: LottoEsterno } | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["strumenti", "produzione"]);
  const parsed = compositoCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const ids = [...new Set(parsed.data.lottiIds)];
  if (ids.length < 2) {
    return { success: false, error: "Servono almeno due lotti distinti." };
  }
  const supabase = await createClient();
  const { data: parts, error: pErr } = await supabase
    .from("lotti_esterni")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);
  if (pErr) return { success: false, error: pErr.message };
  const rows = (parts ?? []) as LottoRow[];
  if (rows.length !== ids.length) {
    return { success: false, error: "Uno o più lotti non esistono." };
  }
  if (rows.some((r) => r.is_composito)) {
    return {
      success: false,
      error: "I lotti da includere devono essere lotti semplici, non già inclusivi.",
    };
  }
  const now = new Date().toISOString();
  let created: LottoRow | null = null;
  let lastError = "Creazione lotto inclusivo fallita.";
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = await nextCodiceUscita(supabase, new Date());
    const { data, error } = await supabase
      .from("lotti_esterni")
      .insert({
        codice: next.codice,
        tipo: "prodotto_uscita_composito",
        settimana: next.week,
        anno: next.year,
        seq_hex: next.seqHex,
        foglio_lavorazione_id: null,
        prodotto_nome:
          rows.map((r) => r.prodotto_nome).filter(Boolean).join(" + ") || null,
        is_composito: true,
        versione: 1,
        documento_stato: "registrato",
        public_token: newPublicToken(),
        public_enabled: true,
        visibilita: VISIBILITA_DEFAULT,
        note:
          parsed.data.note?.trim() ||
          "Lotto inclusivo: merce da più lotti in uscita.",
        generated_at: now,
        generated_by: auth.userId,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("*")
      .single();
    if (!error && data) {
      created = data as LottoRow;
      break;
    }
    lastError = error?.message ?? lastError;
    if (error?.code !== "23505") {
      return { success: false, error: lastError };
    }
  }
  if (!created) {
    return { success: false, error: lastError };
  }
  const { error: cErr } = await supabase.from("lotti_esterni_componenti").insert(
    rows.map((r, i) => ({
      lotto_composito_id: created.id,
      lotto_componente_id: r.id,
      sort_order: i,
      created_by: auth.userId,
      updated_by: auth.userId,
    }))
  );
  if (cErr) {
    return { success: false, error: cErr.message };
  }
  void writeAuditLog({
    entity_type: "lotti_esterni",
    entity_id: created.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Lotto inclusivo ${created.codice} da ${rows.map((r) => r.codice).join(", ")}`,
    payload: { componenti: rows.map((r) => r.codice) },
  });
  const componenti = await loadComponenti(supabase, created.id);
  return { success: true, lotto: mapLotto(created, { componenti }) };
}

async function buildTimeline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lotto: LottoEsterno
): Promise<TimelineEvento[]> {
  const events: TimelineEvento[] = [];
  events.push({
    key: "raccolto",
    at: null,
    titolo: "Raccolto",
    dettaglio:
      "Il quaderno di campagna (Gestionale Fornitori) non è ancora attivo. Quando ci sarà, qui comparirà data, campo e produttore.",
    pending: true,
  });

  let foglio: FoglioLavorazioneTimeline | null = null;
  if (lotto.foglioLavorazioneId) {
    const { data } = await supabase
      .from("produzione_fogli_lavorazione")
      .select(
        "id, codice, started_at, expected_end_at, closed_at, prodotto, lotto_label, lotto_id, codice_prodotto_uscita, created_by, note, motivo"
      )
      .eq("id", lotto.foglioLavorazioneId)
      .maybeSingle();
    foglio = data as FoglioLavorazioneTimeline | null;
  }

  const mpHint = [foglio?.lotto_id, foglio?.lotto_label]
    .filter(Boolean)
    .join(" ");
  const mpMatch = mpHint.toUpperCase().match(/[0-9]{6}[0-9A-F]{5}/);
  if (mpMatch && isValidLottoIngressoMp(mpMatch[0])) {
    const { data: ing } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .select(
        "codice, lotto_codice, arrivato_at, ddt_produttore, quantita, quantita_unita, origine, note"
      )
      .eq("lotto_codice", mpMatch[0])
      .is("deleted_at", null)
      .maybeSingle();
    if (ing) {
      const i = ing as {
        codice: string;
        lotto_codice: string;
        arrivato_at: string;
        ddt_produttore: string;
        quantita: number;
        quantita_unita: string;
        origine: string;
        note: string;
      };
      events.push({
        key: "arrivo",
        at: i.arrivato_at,
        titolo: "Arrivo in azienda",
        dettaglio: `${i.origine === "inventario_magazzino" ? "Inventario / settaggio" : "Ingresso produttore"} · foglio ${i.codice} · ${i.quantita} ${i.quantita_unita}. DDT: ${i.ddt_produttore || "—"}.`,
        interno: `Codice MP ${i.lotto_codice}`,
      });
      if (foglio) {
        const waitMs =
          new Date(foglio.started_at).getTime() -
          new Date(i.arrivato_at).getTime();
        const hours = Math.max(0, Math.round(waitMs / 36e5));
        events.push({
          key: "attesa",
          at: i.arrivato_at,
          titolo: "Attesa prima della lavorazione",
          dettaglio: `Circa ${hours} ore tra arrivo e apertura del foglio di lavorazione.`,
        });
      }
    }
  }
  if (!events.some((e) => e.key === "arrivo")) {
    events.push({
      key: "arrivo",
      at: null,
      titolo: "Arrivo in azienda",
      dettaglio:
        "Nessun foglio ingresso MP collegato in automatico (il foglio usa ancora un lotto demo o un riferimento libero).",
      pending: true,
    });
  }

  if (foglio) {
    events.push({
      key: "foglio",
      at: foglio.started_at,
      titolo: "Foglio di lavorazione",
      dettaglio: `${foglio.codice} · ${foglio.prodotto || lotto.prodottoNome || "—"} · motivo ${foglio.motivo}. Previsto fino al ${new Date(foglio.expected_end_at).toLocaleString("it-IT")}${foglio.closed_at ? ` · chiuso ${new Date(foglio.closed_at).toLocaleString("it-IT")}` : " · ancora aperto"}.`,
      interno: foglio.codice,
    });
    let persona = "Operatore che ha aperto il foglio";
    if (foglio.created_by) {
      const { data: pr } = await supabase
        .from("profiles")
        .select("first_name, last_name, full_name")
        .eq("id", foglio.created_by)
        .maybeSingle();
      const p = pr as {
        first_name?: string;
        last_name?: string;
        full_name?: string;
      } | null;
      const nominativo =
        `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ||
        (p?.full_name ?? "").trim();
      if (nominativo) persona = nominativo;
    }
    events.push({
      key: "personale",
      at: foglio.started_at,
      titolo: "Personale coinvolto",
      dettaglio: persona,
      interno: foglio.created_by ?? undefined,
    });

    const { data: counts } = await supabase
      .from("produzione_foglio_conteggi")
      .select("kg_versati, kg_essiccatori, kg_non_conformi, esito_bilancio, note_nc, area_id")
      .eq("foglio_id", foglio.id)
      .is("deleted_at", null);
    const rows = (counts ?? []) as Array<{
      kg_versati: number;
      kg_essiccatori: number;
      kg_non_conformi: number;
      esito_bilancio: string;
      note_nc: string;
    }>;
    if (rows.length) {
      const t = rows[0];
      events.push({
        key: "essiccazione",
        at: foglio.started_at,
        titolo: "Essiccazione / bilancio di massa",
        dettaglio: `Versati ${t.kg_versati} kg · essiccatori ${t.kg_essiccatori} kg · non conformi ${t.kg_non_conformi} kg · esito ${t.esito_bilancio}.`,
      });
      events.push({
        key: "parametri",
        at: foglio.started_at,
        titolo: "Parametri e note di processo",
        dettaglio: t.note_nc?.trim() || foglio.note?.trim() || "Nessun parametro extra registrato.",
      });
    } else {
      events.push({
        key: "essiccazione",
        at: null,
        titolo: "Essiccazione / aree",
        dettaglio: "Nessun conteggio di area sul foglio. Comparirà quando il reparto registra i kg.",
        pending: true,
      });
      events.push({
        key: "parametri",
        at: null,
        titolo: "Parametri di processo",
        dettaglio: foglio.note?.trim() || "Nessun parametro IoT collegato a questo lotto.",
        pending: !foglio.note?.trim(),
      });
    }
  } else if (!lotto.isComposito) {
    events.push({
      key: "foglio",
      at: lotto.generatedAt,
      titolo: "Foglio di lavorazione",
      dettaglio: "Lotto senza foglio collegato.",
      pending: true,
    });
  }

  const { data: movs } = await supabase
    .from("magazzino_movimenti")
    .select("created_at, prodotto_codice, quantita_kg, unita, lotto_codice, note")
    .eq("lotto_esterno_id", lotto.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(20);
  const movimenti = (movs ?? []) as Array<{
    created_at: string;
    prodotto_codice: string;
    quantita_kg: number;
    unita: string | null;
    lotto_codice: string | null;
    note: string | null;
  }>;
  if (movimenti.length) {
    for (const m of movimenti) {
      const interno = m.lotto_codice
        ? `Lotto interno ${m.lotto_codice}`
        : undefined;
      events.push({
        key: "magazzino",
        at: m.created_at,
        titolo: "Ingresso in magazzino",
        dettaglio: `${m.prodotto_codice} · ${m.quantita_kg} ${m.unita || "kg"}${m.note ? ` · ${m.note}` : ""}`,
        interno,
      });
    }
  } else {
    events.push({
      key: "magazzino",
      at: null,
      titolo: "Ingresso in magazzino",
      dettaglio: "Nessun carico registrato ancora su questo lotto in uscita.",
      pending: true,
    });
  }

  events.push({
    key: "imballaggio",
    at: null,
    titolo: "Imballaggio",
    dettaglio: "Si collegherà quando l’ordine userà questo lotto sulle confezioni.",
    pending: true,
  });
  events.push({
    key: "spedizione",
    at: null,
    titolo: "Spedizione",
    dettaglio: "Si collegherà a DDT / tracking quando la spedizione sarà attiva.",
    pending: true,
  });

  if (lotto.componenti.length) {
    events.push({
      key: "lotti_componenti",
      at: lotto.generatedAt,
      titolo: "Lotti inclusi",
      dettaglio: `Questo lotto di vendita unisce: ${lotto.componenti.map((c) => c.codice).join(", ")}.`,
    });
  }

  const parsedInterno = parseLottoUscita(lotto.codice);
  if (parsedInterno) {
    events.push({
      key: "lotti_interni",
      at: lotto.generatedAt,
      titolo: "Lettura del codice esterno",
      dettaglio: `Settimana ISO ${parsedInterno.week} del ${parsedInterno.year}, sequenza hex ${parsedInterno.seqHex}.`,
      interno: `Documento ${labelTipoLottoEsterno(lotto.tipo)} v${lotto.versione}`,
    });
  }

  events.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return new Date(a.at).getTime() - new Date(b.at).getTime();
  });
  return events;
}

export type DecodificaLotto = {
  lotto: LottoEsterno;
  eventi: TimelineEvento[];
  publicUrl: string;
};

function filterEventi(
  eventi: TimelineEvento[],
  visibilita: Record<VisibilitaChiave, boolean>,
  pubblico: boolean
): TimelineEvento[] {
  return eventi
    .filter((e) => !pubblico || visibilita[e.key])
    .map((e) =>
      pubblico && !visibilita.lotti_interni
        ? { ...e, interno: undefined }
        : e
    );
}

export async function getDecodificaLottoAction(
  codice: string
): Promise<
  { success: true; data: DecodificaLotto } | { success: false; error: string }
> {
  const found = await getLottoEsternoByCodiceAction(codice);
  if (!found.success) return found;
  const supabase = await createClient();
  const eventi = await buildTimeline(supabase, found.lotto);
  return {
    success: true,
    data: {
      lotto: found.lotto,
      eventi,
      publicUrl: publicLottoUrl(found.lotto.publicToken, getPublicAppUrl()),
    },
  };
}

export async function getDecodificaLottoPubblicoAction(
  token: string
): Promise<
  | { success: true; data: DecodificaLotto }
  | { success: false; error: string }
> {
  const t = token.trim();
  if (!t || t.length < 16) {
    return { success: false, error: "Codice pubblico non valido." };
  }
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return { success: false, error: "Servizio non configurato." };
  }
  const { data, error } = await supabase
    .from("lotti_esterni")
    .select("*")
    .eq("public_token", t)
    .eq("public_enabled", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: "Lotto non pubblicato o codice errato." };
  }
  const row = data as LottoRow;
  const componenti = row.is_composito
    ? await loadComponenti(supabase as never, row.id)
    : [];
  let foglioCodice: string | null = null;
  if (row.foglio_lavorazione_id) {
    const { data: f } = await supabase
      .from("produzione_fogli_lavorazione")
      .select("codice")
      .eq("id", row.foglio_lavorazione_id)
      .maybeSingle();
    foglioCodice = (f as { codice?: string } | null)?.codice ?? null;
  }
  const lotto = mapLotto(row, { foglioCodice, componenti });
  const eventi = filterEventi(
    await buildTimeline(supabase as never, lotto),
    lotto.visibilita,
    true
  );
  return {
    success: true,
    data: {
      lotto,
      eventi,
      publicUrl: publicLottoUrl(lotto.publicToken, getPublicAppUrl()),
    },
  };
}
