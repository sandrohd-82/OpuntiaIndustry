"use server";

import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isMagazzinoCaricoUnita } from "@/lib/magazzino/types";
import type {
  ImballaggioMagazzinoOpt,
  LottoAgrinsiciliaDettaglio,
  LottoAgrinsiciliaElencoRiga,
  LottoTimelineEvento,
  MagazzinoCaricoUnita,
} from "@/lib/magazzino/types";

const CATALOG_PROPRIO = "prodotto_proprio";

function labelPersona(p: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
} | null): string | null {
  if (!p) return null;
  const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return n || (p.full_name ?? "").trim() || null;
}

async function nomiProfili(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, full_name")
    .in("id", unique);
  for (const row of (data ?? []) as Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  }>) {
    const nome = labelPersona(row);
    if (nome) map.set(row.id, nome);
  }
  return map;
}

export async function listImballaggiCiMagazzinoAction(): Promise<
  | { success: true; confezioni: ImballaggioMagazzinoOpt[]; isolamenti: ImballaggioMagazzinoOpt[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imballaggi_voci")
    .select("id, codice, nome, stadio, doppio_ruolo")
    .is("deleted_at", null)
    .in("stadio", ["confezione", "isolamento"])
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  const items = ((data ?? []) as Array<{
    id: string;
    codice: string;
    nome: string;
    stadio: "confezione" | "isolamento";
    doppio_ruolo: boolean | null;
  }>).map((r) => ({
    id: r.id,
    codice: r.codice,
    nome: r.nome,
    stadio: r.stadio,
    doppioRuolo: Boolean(r.doppio_ruolo),
  }));
  return {
    success: true,
    confezioni: items.filter((i) => i.stadio === "confezione" || i.doppioRuolo),
    isolamenti: items.filter((i) => i.stadio === "isolamento" || i.doppioRuolo),
  };
}

export async function listLottiAgrinsiciliaProdottoAction(
  prodottoId: string
): Promise<
  | { success: true; lotti: LottoAgrinsiciliaElencoRiga[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  if (!prodottoId) return { success: true, lotti: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_movimenti")
    .select(
      "prodotto_id, lotto_codice, quantita_kg, created_at, confez_isolamento_rimandato, confezione_id, isolamento_id, foglio:produzione_fogli_lavorazione(codice), foglio_ingresso:produzione_fogli_ingresso_mp!foglio_ingresso_mp_id(codice), lotto_esterno:lotti_esterni!lotto_esterno_id(codice), confezione:imballaggi_voci!confezione_id(nome), isolamento:imballaggi_voci!isolamento_id(nome)"
    )
    .eq("catalog_kind", CATALOG_PROPRIO)
    .eq("prodotto_id", prodottoId)
    .is("deleted_at", null)
    .not("lotto_codice", "is", null)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const byLotto = new Map<string, LottoAgrinsiciliaElencoRiga>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const lotto = String(r.lotto_codice ?? "").trim();
    if (!lotto) continue;
    const foglio = Array.isArray(r.foglio) ? r.foglio[0] : r.foglio;
    const ingresso = Array.isArray(r.foglio_ingresso)
      ? r.foglio_ingresso[0]
      : r.foglio_ingresso;
    const esterno = Array.isArray(r.lotto_esterno)
      ? r.lotto_esterno[0]
      : r.lotto_esterno;
    const conf = Array.isArray(r.confezione) ? r.confezione[0] : r.confezione;
    const iso = Array.isArray(r.isolamento) ? r.isolamento[0] : r.isolamento;
    const prev = byLotto.get(lotto);
    const qty = Number(r.quantita_kg) || 0;
    const daCompletare =
      Boolean(r.confez_isolamento_rimandato) ||
      !r.confezione_id ||
      !r.isolamento_id;
    if (!prev) {
      byLotto.set(lotto, {
        lottoCodice: lotto,
        prodottoId,
        quantitaKg: qty,
        ultimoAt: String(r.created_at ?? ""),
        foglioCodice:
          (foglio as { codice?: string } | null)?.codice ?? null,
        foglioIngressoCodice:
          (ingresso as { codice?: string } | null)?.codice ?? null,
        lottoUscitaCodice:
          (esterno as { codice?: string } | null)?.codice ?? null,
        confezioneNome: (conf as { nome?: string } | null)?.nome ?? null,
        isolamentoNome: (iso as { nome?: string } | null)?.nome ?? null,
        daCompletareCi: daCompletare,
      });
    } else {
      prev.quantitaKg = Math.round((prev.quantitaKg + qty) * 1000) / 1000;
      prev.daCompletareCi = prev.daCompletareCi || daCompletare;
      if (!prev.foglioCodice) {
        prev.foglioCodice =
          (foglio as { codice?: string } | null)?.codice ?? null;
      }
      if (!prev.foglioIngressoCodice) {
        prev.foglioIngressoCodice =
          (ingresso as { codice?: string } | null)?.codice ?? null;
      }
      if (!prev.lottoUscitaCodice) {
        prev.lottoUscitaCodice =
          (esterno as { codice?: string } | null)?.codice ?? null;
      }
    }
  }

  return {
    success: true,
    lotti: [...byLotto.values()].sort((a, b) =>
      b.ultimoAt.localeCompare(a.ultimoAt)
    ),
  };
}

export async function getLottoAgrinsiciliaDettaglioAction(input: {
  lottoCodice: string;
  prodottoId?: string;
}): Promise<
  | { success: true; lotto: LottoAgrinsiciliaDettaglio }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const lottoCodice = input.lottoCodice.trim();
  if (!lottoCodice) return { success: false, error: "Lotto mancante." };
  const supabase = await createClient();

  let movQ = supabase
    .from("magazzino_movimenti")
    .select(
      "id, prodotto_id, prodotto_codice, tipo, quantita_kg, unita, note, created_at, created_by, foglio_id, foglio_ingresso_mp_id, lotto_esterno_id, confezione_id, isolamento_id, confez_isolamento_rimandato"
    )
    .eq("catalog_kind", CATALOG_PROPRIO)
    .eq("lotto_codice", lottoCodice)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (input.prodottoId) movQ = movQ.eq("prodotto_id", input.prodottoId);
  const { data: movs, error: movErr } = await movQ;
  if (movErr) return { success: false, error: movErr.message };
  const movimenti = (movs ?? []) as Array<{
    id: string;
    prodotto_id: string;
    prodotto_codice: string;
    tipo: string;
    quantita_kg: number;
    unita: string;
    note: string | null;
    created_at: string;
    created_by: string | null;
    foglio_id: string | null;
    foglio_ingresso_mp_id: string | null;
    lotto_esterno_id: string | null;
    confezione_id: string | null;
    isolamento_id: string | null;
    confez_isolamento_rimandato: boolean;
  }>;
  if (!movimenti.length) {
    return { success: false, error: "Nessun movimento per questo lotto." };
  }

  const first = movimenti[0]!;
  const last = movimenti[movimenti.length - 1]!;
  const { data: prodotto } = await supabase
    .from("prodotti_propri")
    .select("id, codice, nome")
    .eq("id", first.prodotto_id)
    .maybeSingle();

  const foglioId = [...movimenti].reverse().find((m) => m.foglio_id)?.foglio_id;
  const ingressoId = [...movimenti]
    .reverse()
    .find((m) => m.foglio_ingresso_mp_id)?.foglio_ingresso_mp_id;
  const lottoEsternoId = [...movimenti]
    .reverse()
    .find((m) => m.lotto_esterno_id)?.lotto_esterno_id;
  const confezioneId =
    [...movimenti].reverse().find((m) => m.confezione_id)?.confezione_id ??
    null;
  const isolamentoId =
    [...movimenti].reverse().find((m) => m.isolamento_id)?.isolamento_id ??
    null;

  const [foglioRes, ingressoRes, esternoRes, confRes, isoRes] = await Promise.all([
    foglioId
      ? supabase
          .from("produzione_fogli_lavorazione")
          .select(
            "id, codice, stato, lotto_label, started_at, closed_at, created_by"
          )
          .eq("id", foglioId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ingressoId
      ? supabase
          .from("produzione_fogli_ingresso_mp")
          .select(
            "id, codice, lotto_codice, documento_stato, origine, operatore_muletto_id, arrivato_at, confirmed_at, closed_at, created_by, created_at"
          )
          .eq("id", ingressoId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    lottoEsternoId
      ? supabase
          .from("lotti_esterni")
          .select("id, codice, settimana, anno, public_token, generated_at, generated_by")
          .eq("id", lottoEsternoId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    confezioneId
      ? supabase
          .from("imballaggi_voci")
          .select("nome")
          .eq("id", confezioneId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isolamentoId
      ? supabase
          .from("imballaggi_voci")
          .select("nome")
          .eq("id", isolamentoId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const foglio = foglioRes.data as {
    id: string;
    codice: string;
    stato: string;
    lotto_label: string | null;
    started_at: string | null;
    closed_at: string | null;
    created_by: string | null;
  } | null;
  const ingresso = ingressoRes.data as {
    id: string;
    codice: string;
    lotto_codice: string | null;
    documento_stato: string;
    origine: string | null;
    operatore_muletto_id: string | null;
    arrivato_at: string | null;
    confirmed_at: string | null;
    closed_at: string | null;
    created_by: string | null;
    created_at: string;
  } | null;
  const esterno = esternoRes.data as {
    id: string;
    codice: string;
    settimana: number | null;
    anno: number | null;
    public_token: string | null;
    generated_at: string | null;
    generated_by: string | null;
  } | null;

  let mulettoNome: string | null = null;
  if (ingresso?.operatore_muletto_id) {
    const { data: persona } = await supabase
      .from("organigramma_persone")
      .select("nome, cognome")
      .eq("id", ingresso.operatore_muletto_id)
      .maybeSingle();
    const p = persona as { nome?: string; cognome?: string } | null;
    mulettoNome = `${p?.nome ?? ""} ${p?.cognome ?? ""}`.trim() || null;
  }

  const profileIds = [
    ...movimenti.map((m) => m.created_by),
    foglio?.created_by,
    ingresso?.created_by,
    esterno?.generated_by,
  ];
  const nomi = await nomiProfili(supabase, profileIds);

  const timeline: LottoTimelineEvento[] = [];
  if (ingresso) {
    timeline.push({
      at: ingresso.created_at,
      titolo: "Foglio ingresso materia prima",
      dettaglio: `${ingresso.codice}${ingresso.lotto_codice ? ` · MP ${ingresso.lotto_codice}` : ""}${ingresso.origine ? ` · origine ${ingresso.origine}` : ""}`,
      operatore: nomi.get(ingresso.created_by ?? "") ?? null,
    });
    if (ingresso.arrivato_at) {
      timeline.push({
        at: ingresso.arrivato_at,
        titolo: "Arrivo merce / scarico",
        dettaglio: "Registrazione arrivo sul foglio ingresso",
        operatore: mulettoNome,
      });
    }
    if (ingresso.confirmed_at) {
      timeline.push({
        at: ingresso.confirmed_at,
        titolo: "Conferma foglio ingresso",
        dettaglio: `Stato ${ingresso.documento_stato}`,
        operatore: null,
      });
    }
    if (ingresso.closed_at) {
      timeline.push({
        at: ingresso.closed_at,
        titolo: "Chiusura foglio ingresso",
        dettaglio: ingresso.codice,
        operatore: null,
      });
    }
  }
  if (foglio) {
    if (foglio.started_at) {
      timeline.push({
        at: foglio.started_at,
        titolo: "Foglio di lavorazione aperto",
        dettaglio: `${foglio.codice}${foglio.lotto_label ? ` · ${foglio.lotto_label}` : ""}`,
        operatore: nomi.get(foglio.created_by ?? "") ?? null,
      });
    }
    if (foglio.closed_at) {
      timeline.push({
        at: foglio.closed_at,
        titolo: "Foglio di lavorazione chiuso",
        dettaglio: foglio.codice,
        operatore: null,
      });
    }
  }
  for (const m of movimenti) {
    timeline.push({
      at: m.created_at,
      titolo: m.tipo === "carico" ? "Carico magazzino" : `Movimento ${m.tipo}`,
      dettaglio: `${m.quantita_kg} ${m.unita}${m.note ? ` · ${m.note}` : ""}`,
      operatore: nomi.get(m.created_by ?? "") ?? null,
    });
  }
  if (esterno?.generated_at) {
    timeline.push({
      at: esterno.generated_at,
      titolo: "Lotto esterno in uscita",
      dettaglio: esterno.codice,
      operatore: nomi.get(esterno.generated_by ?? "") ?? null,
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const quantitaKg = Math.round(
    movimenti.reduce((s, m) => s + (Number(m.quantita_kg) || 0), 0) * 1000
  ) / 1000;
  const daCompletareCi = movimenti.some(
    (m) => m.confez_isolamento_rimandato || !m.confezione_id || !m.isolamento_id
  );
  const unita: MagazzinoCaricoUnita = isMagazzinoCaricoUnita(last.unita)
    ? last.unita
    : "kg";

  return {
    success: true,
    lotto: {
      lottoCodice,
      prodottoId: first.prodotto_id,
      prodottoCodice:
        (prodotto as { codice?: string } | null)?.codice ??
        first.prodotto_codice,
      prodottoNome: (prodotto as { nome?: string } | null)?.nome ?? "",
      quantitaKg,
      unita,
      daCompletareCi,
      confezioneId,
      isolamentoId,
      confezioneNome:
        (confRes.data as { nome?: string } | null)?.nome ?? null,
      isolamentoNome: (isoRes.data as { nome?: string } | null)?.nome ?? null,
      foglio: foglio
        ? {
            id: foglio.id,
            codice: foglio.codice,
            stato: foglio.stato,
            lottoLabel: foglio.lotto_label,
            startedAt: foglio.started_at,
            closedAt: foglio.closed_at,
          }
        : null,
      foglioIngresso: ingresso
        ? {
            id: ingresso.id,
            codice: ingresso.codice,
            lottoMp: ingresso.lotto_codice,
            documentoStato: ingresso.documento_stato,
            origine: ingresso.origine,
            operatoreMuletto: mulettoNome,
            arrivatoAt: ingresso.arrivato_at,
            confirmedAt: ingresso.confirmed_at,
            closedAt: ingresso.closed_at,
          }
        : null,
      lottoEsterno: esterno
        ? {
            id: esterno.id,
            codice: esterno.codice,
            settimana: esterno.settimana,
            anno: esterno.anno,
            publicToken: esterno.public_token,
          }
        : null,
      movimenti: movimenti.map((m) => ({
        id: m.id,
        createdAt: m.created_at,
        tipo: m.tipo,
        quantitaKg: Number(m.quantita_kg) || 0,
        unita: m.unita,
        note: m.note ?? "",
        operatore: nomi.get(m.created_by ?? "") ?? null,
      })),
      timeline,
    },
  };
}

export async function completaConfezIsolamentoLottoAction(input: {
  lottoCodice: string;
  prodottoId: string;
  confezioneId: string;
  isolamentoId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("magazzino");
  if (!input.confezioneId || !input.isolamentoId) {
    return {
      success: false,
      error: "Seleziona sia il confezionamento sia l’isolamento.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_movimenti")
    .update({
      confezione_id: input.confezioneId,
      isolamento_id: input.isolamentoId,
      confez_isolamento_rimandato: false,
      updated_by: auth.userId,
    })
    .eq("catalog_kind", CATALOG_PROPRIO)
    .eq("prodotto_id", input.prodottoId)
    .eq("lotto_codice", input.lottoCodice)
    .is("deleted_at", null)
    .select("id");
  if (error) return { success: false, error: error.message };
  const ids = (data ?? []) as Array<{ id: string }>;
  if (!ids.length) {
    return { success: false, error: "Nessun movimento da aggiornare." };
  }
  await writeAuditLog({
    entity_type: "magazzino_movimenti",
    entity_id: ids[0]!.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Completati confezione/isolamento lotto ${input.lottoCodice}`,
    payload: {
      lotto_codice: input.lottoCodice,
      confezione_id: input.confezioneId,
      isolamento_id: input.isolamentoId,
      movimenti: ids.map((r) => r.id),
    },
  });
  return { success: true };
}
