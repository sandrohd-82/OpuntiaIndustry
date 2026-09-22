"use server";

import { z } from "zod";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { segnoQuantitaMovimento } from "@/lib/magazzino/types";
import {
  messaggioLottoProduzione,
  selezionaLottiPerRichiesta,
  type LottoInserimentoOption,
  type LottoMagazzinoPrelievo,
  type LottoPrelievoUsato,
  type ModoLottoProduzione,
  type ProcessoInserimentoOption,
} from "@/lib/produzione/lotto-produzione-magazzino";
import { createServiceClient } from "@/lib/supabase/server";
import {
  anteprimaLottoUscitaAction,
  creaLottoUscitaAlSalvataggio,
  creaLottoUscitaCompositoAction,
} from "@/app/actions/lotti-esterni";

const CATALOG_PROPRIO = "prodotto_proprio";

const anteprimaSchema = z.object({
  prodottoId: z.string().uuid(),
  richiestaKg: z.number().nonnegative(),
  prodottoNome: z.string().trim().max(200).optional(),
});

export type AnteprimaLottoProduzione = {
  lottoCodice: string;
  lottoEsternoId: string | null;
  mode: ModoLottoProduzione;
  persistito: boolean;
  messaggio: string;
  lottiInterni: Array<{
    codice: string;
    quantitaKg: number;
    usatoKg: number;
    lottoEsternoCodice: string | null;
  }>;
};

export type AssegnaLottoProduzioneResult =
  | { success: true; anteprima: AnteprimaLottoProduzione }
  | { success: false; error: string };

async function listLottiDisponibili(
  prodottoId: string
): Promise<
  { success: true; lotti: LottoMagazzinoPrelievo[] } | { success: false; error: string }
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("magazzino_movimenti")
    .select(
      "lotto_codice, tipo, quantita_kg, created_at, lotto_esterno_id, lotto_esterno:lotti_esterni!lotto_esterno_id(id, codice)"
    )
    .eq("catalog_kind", CATALOG_PROPRIO)
    .eq("prodotto_id", prodottoId)
    .is("deleted_at", null)
    .not("lotto_codice", "is", null)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const byLotto = new Map<string, LottoMagazzinoPrelievo>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const lotto = String(r.lotto_codice ?? "").trim();
    if (!lotto) continue;
    const esterno = Array.isArray(r.lotto_esterno)
      ? r.lotto_esterno[0]
      : r.lotto_esterno;
    const ext = esterno as { id?: string; codice?: string } | null;
    const qty = segnoQuantitaMovimento(
      String(r.tipo ?? ""),
      Number(r.quantita_kg) || 0
    );
    const prev = byLotto.get(lotto);
    if (!prev) {
      byLotto.set(lotto, {
        lottoInternoCodice: lotto,
        quantitaKg: qty,
        ultimoAt: String(r.created_at ?? ""),
        lottoEsternoId: String(r.lotto_esterno_id ?? ext?.id ?? "") || null,
        lottoEsternoCodice: ext?.codice?.trim() || null,
      });
    } else {
      prev.quantitaKg = Math.round((prev.quantitaKg + qty) * 1000) / 1000;
      if (!prev.lottoEsternoId && (r.lotto_esterno_id || ext?.id)) {
        prev.lottoEsternoId = String(r.lotto_esterno_id ?? ext?.id ?? "") || null;
        prev.lottoEsternoCodice = ext?.codice?.trim() || prev.lottoEsternoCodice;
      }
    }
  }

  return { success: true, lotti: [...byLotto.values()] };
}

async function associaEsternoAiMovimenti(input: {
  prodottoId: string;
  lottoInternoCodice: string;
  lottoEsternoId: string;
  userId: string;
}): Promise<string | null> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("magazzino_movimenti")
    .update({
      lotto_esterno_id: input.lottoEsternoId,
      updated_by: input.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("catalog_kind", CATALOG_PROPRIO)
    .eq("prodotto_id", input.prodottoId)
    .eq("lotto_codice", input.lottoInternoCodice)
    .is("deleted_at", null)
    .is("lotto_esterno_id", null);
  return error?.message ?? null;
}

async function ensureEsternoSemplice(input: {
  lotto: LottoPrelievoUsato;
  prodottoId: string;
  prodottoNome?: string | null;
  userId: string;
}): Promise<
  | { success: true; id: string; codice: string }
  | { success: false; error: string }
> {
  if (input.lotto.lottoEsternoId && input.lotto.lottoEsternoCodice) {
    return {
      success: true,
      id: input.lotto.lottoEsternoId,
      codice: input.lotto.lottoEsternoCodice,
    };
  }
  const created = await creaLottoUscitaAlSalvataggio({
    userId: input.userId,
    prodottoNome: input.prodottoNome ?? null,
    note: `Lotto in uscita associato al lotto interno ${input.lotto.lottoInternoCodice} (inserimento in produzione).`,
  });
  if (!created.success) return created;
  const assocErr = await associaEsternoAiMovimenti({
    prodottoId: input.prodottoId,
    lottoInternoCodice: input.lotto.lottoInternoCodice,
    lottoEsternoId: created.lotto.id,
    userId: input.userId,
  });
  if (assocErr) return { success: false, error: assocErr };
  return { success: true, id: created.lotto.id, codice: created.lotto.codice };
}

function mapAnteprima(
  selected: LottoPrelievoUsato[],
  mode: ModoLottoProduzione,
  lottoCodice: string,
  lottoEsternoId: string | null,
  persistito: boolean
): AnteprimaLottoProduzione {
  return {
    lottoCodice,
    lottoEsternoId,
    mode,
    persistito,
    messaggio: messaggioLottoProduzione(mode, selected, persistito),
    lottiInterni: selected.map((l) => ({
      codice: l.lottoInternoCodice,
      quantitaKg: l.quantitaKg,
      usatoKg: l.usatoKg,
      lottoEsternoCodice: l.lottoEsternoCodice,
    })),
  };
}

export async function assegnaLottoProduzioneDaMagazzino(input: {
  prodottoId: string;
  richiestaKg: number;
  userId: string;
  persist: boolean;
  prodottoNome?: string | null;
}): Promise<AssegnaLottoProduzioneResult> {
  if (!input.prodottoId) {
    return { success: false, error: "Prodotto mancante per attribuire il lotto." };
  }
  const listed = await listLottiDisponibili(input.prodottoId);
  if (!listed.success) return listed;
  const scelta = selezionaLottiPerRichiesta(listed.lotti, input.richiestaKg);
  if (scelta.selected.length === 0) {
    return {
      success: false,
      error:
        "Nessun lotto con giacenza per questo prodotto. Controlla i movimenti di magazzino.",
    };
  }
  if (!scelta.copre) {
    return {
      success: false,
      error:
        "I lotti in magazzino non coprono la quantità richiesta. Impossibile attribuire il numero di lotto.",
    };
  }

  if (!input.persist) {
    if (scelta.mode !== "cumulativo") {
      const only = scelta.selected[0]!;
      if (only.lottoEsternoCodice) {
        return {
          success: true,
          anteprima: mapAnteprima(
            scelta.selected,
            scelta.mode,
            only.lottoEsternoCodice,
            only.lottoEsternoId,
            false
          ),
        };
      }
    }
    const preview = await anteprimaLottoUscitaAction();
    if (!preview.success) return preview;
    return {
      success: true,
      anteprima: mapAnteprima(
        scelta.selected,
        scelta.mode,
        preview.codice,
        null,
        false
      ),
    };
  }

  const assicurati: Array<{ id: string; codice: string; usatoKg: number }> = [];
  for (const lotto of scelta.selected) {
    const ext = await ensureEsternoSemplice({
      lotto,
      prodottoId: input.prodottoId,
      prodottoNome: input.prodottoNome,
      userId: input.userId,
    });
    if (!ext.success) return ext;
    assicurati.push({ ...ext, usatoKg: lotto.usatoKg });
  }

  const uniqueIds = [...new Set(assicurati.map((a) => a.id))];
  if (uniqueIds.length === 1) {
    const only = assicurati[0]!;
    return {
      success: true,
      anteprima: mapAnteprima(
        scelta.selected,
        scelta.mode === "cumulativo" ? "singolo_copre" : scelta.mode,
        only.codice,
        only.id,
        true
      ),
    };
  }

  const composito = await creaLottoUscitaCompositoAction({
    lottiIds: uniqueIds,
    note: `Lotto cumulativo per inserimento in produzione. Lotti interni: ${scelta.selected
      .map((l) => `${l.lottoInternoCodice} (${l.usatoKg} kg)`)
      .join(", ")}.`,
    componenti: assicurati.map((a) => ({
      lottoId: a.id,
      quantitaKg: a.usatoKg,
    })),
  });
  if (!composito.success) return composito;
  return {
    success: true,
    anteprima: mapAnteprima(
      scelta.selected,
      "cumulativo",
      composito.lotto.codice,
      composito.lotto.id,
      true
    ),
  };
}

export async function listLottiMagazzinoInserimentoAction(): Promise<
  | { success: true; lotti: LottoInserimentoOption[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "produzione", "magazzino"]);
  const supabase = createServiceClient();
  const pageSize = 1000;
  const movimenti: Array<{
    prodotto_id: string | null;
    prodotto_codice: string | null;
    lotto_codice: string | null;
    lotto_esterno_id: string | null;
    tipo: string;
    quantita_kg: number;
  }> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("magazzino_movimenti")
      .select(
        "prodotto_id, prodotto_codice, lotto_codice, lotto_esterno_id, tipo, quantita_kg"
      )
      .eq("catalog_kind", CATALOG_PROPRIO)
      .is("deleted_at", null)
      .not("lotto_codice", "is", null)
      .range(from, from + pageSize - 1);
    if (error) return { success: false, error: error.message };
    const rows = (data ?? []) as typeof movimenti;
    movimenti.push(...rows);
    if (rows.length < pageSize) break;
  }

  const byKey = new Map<string, LottoInserimentoOption>();
  const prodottoIds = new Set<string>();
  const esternoIds = new Set<string>();
  for (const r of movimenti) {
    const lotto = String(r.lotto_codice ?? "").trim();
    const prodottoId = String(r.prodotto_id ?? "").trim();
    if (!lotto || !prodottoId) continue;
    const qty = segnoQuantitaMovimento(
      String(r.tipo ?? ""),
      Number(r.quantita_kg) || 0
    );
    const key = `${prodottoId}::${lotto}`;
    const prev = byKey.get(key);
    if (!prev) {
      prodottoIds.add(prodottoId);
      if (r.lotto_esterno_id) esternoIds.add(r.lotto_esterno_id);
      byKey.set(key, {
        key,
        lottoInternoCodice: lotto,
        lottoEsternoCodice: null,
        prodottoId,
        prodottoCodice: String(r.prodotto_codice ?? "").trim(),
        prodottoNome: "",
        quantitaKg: qty,
      });
    } else {
      prev.quantitaKg = Math.round((prev.quantitaKg + qty) * 1000) / 1000;
      if (!prev.prodottoCodice && r.prodotto_codice) {
        prev.prodottoCodice = String(r.prodotto_codice).trim();
      }
      if (r.lotto_esterno_id) esternoIds.add(r.lotto_esterno_id);
    }
  }

  if (prodottoIds.size) {
    const { data: prodotti } = await supabase
      .from("prodotti_propri")
      .select("id, codice, nome")
      .in("id", [...prodottoIds]);
    const nomi = new Map(
      ((prodotti ?? []) as Array<{ id: string; codice: string; nome: string }>).map(
        (p) => [p.id, p]
      )
    );
    for (const l of byKey.values()) {
      const p = nomi.get(l.prodottoId);
      if (!p) continue;
      l.prodottoNome = p.nome ?? "";
      if (!l.prodottoCodice) l.prodottoCodice = p.codice ?? "";
    }
  }

  if (esternoIds.size) {
    const { data: esterni } = await supabase
      .from("lotti_esterni")
      .select("id, codice")
      .in("id", [...esternoIds])
      .is("deleted_at", null);
    const byEst = new Map(
      ((esterni ?? []) as Array<{ id: string; codice: string }>).map((e) => [
        e.id,
        e.codice,
      ])
    );
    for (const r of movimenti) {
      const lotto = String(r.lotto_codice ?? "").trim();
      const prodottoId = String(r.prodotto_id ?? "").trim();
      if (!lotto || !prodottoId || !r.lotto_esterno_id) continue;
      const opt = byKey.get(`${prodottoId}::${lotto}`);
      if (opt && !opt.lottoEsternoCodice) {
        opt.lottoEsternoCodice = byEst.get(r.lotto_esterno_id)?.trim() || null;
      }
    }
  }

  const lotti = [...byKey.values()]
    .filter((l) => l.quantitaKg > 1e-9)
    .sort((a, b) => {
      const c = a.prodottoCodice.localeCompare(b.prodottoCodice, "it");
      if (c !== 0) return c;
      return a.lottoInternoCodice.localeCompare(b.lottoInternoCodice);
    });
  return { success: true, lotti };
}

export async function listProcessiInserimentoProduzioneAction(): Promise<
  | { success: true; processi: ProcessoInserimentoOption[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "produzione"]);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("produzione_processi")
    .select("id, codice, nome")
    .is("deleted_at", null)
    .is("deprecato_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    processi: ((data ?? []) as Array<{ id: string; codice: string; nome: string }>).map(
      (p) => ({
        id: p.id,
        codice: p.codice,
        nome: p.nome,
      })
    ),
  };
}

export async function anteprimaLottoProduzioneMagazzinoAction(
  raw: unknown
): Promise<AssegnaLottoProduzioneResult> {
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "produzione",
  ]);
  const parsed = anteprimaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati anteprima lotto non validi.",
    };
  }
  return assegnaLottoProduzioneDaMagazzino({
    prodottoId: parsed.data.prodottoId,
    richiestaKg: parsed.data.richiestaKg,
    prodottoNome: parsed.data.prodottoNome,
    userId: auth.userId,
    persist: false,
  });
}
