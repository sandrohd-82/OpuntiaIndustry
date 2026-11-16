"use server";

import { z } from "zod";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { puoAccettareLottoMp } from "@/lib/magazzino/accettazione-mp";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const qtySchema = z.number().positive().max(1_000_000);
const chiaveSchema = z.string().trim().min(8).max(200);

type Errore = { success: false; error: string };

function messaggioDb(error: { message?: string } | null, fallback: string): string {
  const testo = (error?.message ?? "").split("\n")[0] ?? "";
  if (
    testo.includes("HACCP") ||
    testo.includes("in controllo") ||
    testo.includes("disponibile") ||
    testo.includes("Giacenza") ||
    testo.includes("Chiave") ||
    testo.includes("chiave") ||
    testo.includes("Non autorizzato") ||
    testo.includes("lavorazione") ||
    testo.includes("arrivo") ||
    testo.includes("Unità") ||
    testo.includes("unità") ||
    testo.includes("Quantità") ||
    testo.includes("supera")
  ) {
    return testo.replace(/^ERROR:\s*/, "");
  }
  return fallback;
}

async function accessoLotti() {
  return requireAnyAreaAccess(["magazzino", "produzione"]);
}

export type ArrivoDaIdentificare = {
  caricoRigaId: string;
  caricoCodice: string;
  rigaCodice: string;
  rigaNome: string;
  fornitore: string;
  materia: string;
  unita: string;
  prevista: number;
  arrivata: number;
  giaIdentificata: number;
  foglioCodice: string;
  foglioStato: string;
  ddtNumero: string | null;
  ddtData: string | null;
  lottoDichiarato: string | null;
};

export type LottoMpRiga = {
  id: string;
  codice: string;
  materia: string;
  fornitore: string;
  unita: string;
  ddtNumero: string | null;
  foglioCodice: string | null;
  foglioStato: string | null;
  ubicazione: string | null;
  inControllo: number;
  disponibile: number;
  bloccata: number;
  respintaPresente: number;
  respintaUscita: number;
  consumata: number;
  puoAccettare: boolean;
  motivoAccettazione: string | null;
};

export type EventoLottoMp = {
  id: string;
  tipo: string;
  quantita: number;
  unita: string;
  da: string | null;
  a: string | null;
  motivazione: string;
  createdAt: string;
  movimento: string | null;
};

export async function listaArriviDaIdentificareAction(): Promise<
  { success: true; arrivi: ArrivoDaIdentificare[]; ubicazioni: { id: string; codice: string }[] } | Errore
> {
  await accessoLotti();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvvigionamenti_pronti_identificazione")
    .select(
      "carico_riga_id, carico_codice, riga_codice, riga_nome, fornitore_id, materia_prima_id, unita_misura, quantita_prevista, quantita_arrivata, foglio_codice, foglio_stato, ddt_numero, ddt_data, lotto_dichiarato, carico_stato"
    )
    .in("carico_stato", ["parziale", "arrivato"])
    .not("quantita_arrivata", "is", null);
  if (error) return { success: false, error: "Arrivi non disponibili." };
  const righe = data ?? [];
  const rigaIds = righe.map((row) => String(row.carico_riga_id));
  const fornitoreIds = [...new Set(righe.map((row) => String(row.fornitore_id)))];
  const materiaIds = [...new Set(righe.map((row) => String(row.materia_prima_id)))];
  const [{ data: lotti }, { data: fornitori }, { data: materie }, { data: ubicazioni }] =
    await Promise.all([
      rigaIds.length
        ? supabase
            .from("magazzino_mp_lotto_quantita")
            .select("carico_riga_id, quantita_identificata, quantita_rettifica")
            .in("carico_riga_id", rigaIds)
        : Promise.resolve({ data: [] }),
      fornitoreIds.length
        ? supabase.from("fornitori").select("id, ragione_sociale").in("id", fornitoreIds)
        : Promise.resolve({ data: [] }),
      materiaIds.length
        ? supabase.from("materie_prime").select("id, codice, nome").in("id", materiaIds)
        : Promise.resolve({ data: [] }),
      supabase.from("magazzino_ubicazioni").select("id, codice").is("deleted_at", null).limit(200),
    ]);
  const occupata = new Map<string, number>();
  for (const lotto of lotti ?? []) {
    const id = String(lotto.carico_riga_id);
    const somma =
      Number(lotto.quantita_identificata ?? 0) + Number(lotto.quantita_rettifica ?? 0);
    occupata.set(id, (occupata.get(id) ?? 0) + somma);
  }
  const nomiFornitore = new Map(
    (fornitori ?? []).map((row) => [String(row.id), String(row.ragione_sociale)])
  );
  const nomiMateria = new Map(
    (materie ?? []).map((row) => [String(row.id), `${row.codice} · ${row.nome}`])
  );
  return {
    success: true,
    arrivi: righe
      .map((row) => {
        const arrivata = Number(row.quantita_arrivata ?? 0);
        const gia = occupata.get(String(row.carico_riga_id)) ?? 0;
        return {
          caricoRigaId: String(row.carico_riga_id),
          caricoCodice: String(row.carico_codice),
          rigaCodice: String(row.riga_codice ?? ""),
          rigaNome: String(row.riga_nome ?? ""),
          fornitore: nomiFornitore.get(String(row.fornitore_id)) ?? "Fornitore",
          materia: nomiMateria.get(String(row.materia_prima_id)) ?? "Materia",
          unita: String(row.unita_misura ?? ""),
          prevista: Number(row.quantita_prevista ?? 0),
          arrivata,
          giaIdentificata: gia,
          foglioCodice: String(row.foglio_codice ?? ""),
          foglioStato: String(row.foglio_stato ?? ""),
          ddtNumero: row.ddt_numero ? String(row.ddt_numero) : null,
          ddtData: row.ddt_data ? String(row.ddt_data) : null,
          lottoDichiarato: row.lotto_dichiarato ? String(row.lotto_dichiarato) : null,
          residua: arrivata - gia,
        };
      })
      .filter((row) => row.residua > 0)
      .map(({ residua: _residua, ...row }) => row),
    ubicazioni: (ubicazioni ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
    })),
  };
}

export async function identificaLottoMpAction(raw: unknown): Promise<
  { success: true; codice: string; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      caricoRigaId: uuidSchema,
      quantita: qtySchema,
      chiave: chiaveSchema,
      codiceFornitore: z.string().trim().max(40).optional(),
      ddtNumero: z.string().trim().max(40).optional(),
      ddtData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      ubicazioneId: uuidSchema.nullable().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Identificazione non valida." };
  await accessoLotti();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("magazzino_mp_identifica_lotto", {
    p_carico_riga_id: parsed.data.caricoRigaId,
    p_quantita: parsed.data.quantita,
    p_chiave: parsed.data.chiave,
    p_codice_fornitore: parsed.data.codiceFornitore || null,
    p_ddt_numero: parsed.data.ddtNumero || null,
    p_ddt_data: parsed.data.ddtData ?? null,
    p_ubicazione_id: parsed.data.ubicazioneId ?? null,
  });
  if (error) return { success: false, error: messaggioDb(error, "Lotto non identificato.") };
  const corpo = (data ?? {}) as { codice?: string; riusata?: boolean };
  return { success: true, codice: String(corpo.codice ?? ""), riusata: Boolean(corpo.riusata) };
}

export async function listaLottiMpAction(): Promise<{ success: true; lotti: LottoMpRiga[] } | Errore> {
  await accessoLotti();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_mp_lotto_quantita")
    .select(
      "lotto_id, codice, materia_prima_id, fornitore_id, unita, haccp_foglio_id, quantita_in_controllo, quantita_disponibile, quantita_bloccata, quantita_respinta_presente, quantita_respinta_uscita, quantita_consumata_uscita"
    )
    .limit(200);
  if (error) return { success: false, error: "Lotti non disponibili." };
  const righe = data ?? [];
  const materiaIds = [...new Set(righe.map((row) => String(row.materia_prima_id)))];
  const fornitoreIds = [...new Set(righe.map((row) => String(row.fornitore_id)).filter(Boolean))];
  const foglioIds = [...new Set(righe.map((row) => String(row.haccp_foglio_id ?? "")).filter(Boolean))];
  const lottoIds = righe.map((row) => String(row.lotto_id));
  const [{ data: materie }, { data: fornitori }, { data: fogli }, { data: lotti }, { data: esiti }] =
    await Promise.all([
      materiaIds.length
        ? supabase.from("materie_prime").select("id, codice, nome").in("id", materiaIds)
        : Promise.resolve({ data: [] }),
      fornitoreIds.length
        ? supabase.from("fornitori").select("id, ragione_sociale").in("id", fornitoreIds)
        : Promise.resolve({ data: [] }),
      foglioIds.length
        ? supabase.from("haccp_fogli_ingresso").select("id, codice, stato").in("id", foglioIds)
        : Promise.resolve({ data: [] }),
      lottoIds.length
        ? supabase
            .from("magazzino_mp_lotti")
            .select("id, ddt_numero, ubicazione_id")
            .in("id", lottoIds)
        : Promise.resolve({ data: [] }),
      foglioIds.length
        ? supabase
            .from("haccp_fogli_ingresso_risposte")
            .select("foglio_id, voce_codice, valore, confermata_at")
            .in("foglio_id", foglioIds)
            .in("voce_codice", ["mezzo", "1e", "2b", "2g", "2h"])
            .order("confermata_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
  const ubicazioneIds = [
    ...new Set((lotti ?? []).map((row) => String(row.ubicazione_id ?? "")).filter(Boolean)),
  ];
  const { data: ubicazioni } = ubicazioneIds.length
    ? await supabase.from("magazzino_ubicazioni").select("id, codice").in("id", ubicazioneIds)
    : { data: [] };
  const nomiMateria = new Map(
    (materie ?? []).map((row) => [String(row.id), `${row.codice} · ${row.nome}`])
  );
  const nomiFornitore = new Map(
    (fornitori ?? []).map((row) => [String(row.id), String(row.ragione_sociale)])
  );
  const fogliPerId = new Map(
    (fogli ?? []).map((row) => [String(row.id), { codice: String(row.codice), stato: String(row.stato) }])
  );
  const extra = new Map(
    (lotti ?? []).map((row) => [
      String(row.id),
      { ddt: row.ddt_numero ? String(row.ddt_numero) : null, ubicazione: String(row.ubicazione_id ?? "") },
    ])
  );
  const nomiUbicazione = new Map(
    (ubicazioni ?? []).map((row) => [String(row.id), String(row.codice)])
  );
  const esitiPerFoglio = new Map<string, { codice: string; esito: string | null }[]>();
  const visti = new Set<string>();
  for (const row of esiti ?? []) {
    const chiave = `${row.foglio_id}:${row.voce_codice}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    const foglioId = String(row.foglio_id);
    const valore = row.valore as { esito?: string };
    const lista = esitiPerFoglio.get(foglioId) ?? [];
    lista.push({ codice: String(row.voce_codice), esito: valore?.esito ?? null });
    esitiPerFoglio.set(foglioId, lista);
  }
  return {
    success: true,
    lotti: righe.map((row) => {
      const foglio = fogliPerId.get(String(row.haccp_foglio_id ?? ""));
      const decisione = puoAccettareLottoMp({
        foglioStato: foglio?.stato ?? null,
        esiti: esitiPerFoglio.get(String(row.haccp_foglio_id ?? "")) ?? [],
      });
      const dettaglio = extra.get(String(row.lotto_id));
      return {
        id: String(row.lotto_id),
        codice: String(row.codice),
        materia: nomiMateria.get(String(row.materia_prima_id)) ?? "Materia",
        fornitore: nomiFornitore.get(String(row.fornitore_id)) ?? "Fornitore",
        unita: String(row.unita),
        ddtNumero: dettaglio?.ddt ?? null,
        foglioCodice: foglio?.codice ?? null,
        foglioStato: foglio?.stato ?? null,
        ubicazione: dettaglio?.ubicazione ? nomiUbicazione.get(dettaglio.ubicazione) ?? null : null,
        inControllo: Number(row.quantita_in_controllo ?? 0),
        disponibile: Number(row.quantita_disponibile ?? 0),
        bloccata: Number(row.quantita_bloccata ?? 0),
        respintaPresente: Number(row.quantita_respinta_presente ?? 0),
        respintaUscita: Number(row.quantita_respinta_uscita ?? 0),
        consumata: Number(row.quantita_consumata_uscita ?? 0),
        puoAccettare: decisione.ok && Number(row.quantita_in_controllo ?? 0) > 0,
        motivoAccettazione: decisione.ok ? null : decisione.motivo,
      };
    }),
  };
}

export async function eventiLottoMpAction(
  lottoId: string
): Promise<{ success: true; eventi: EventoLottoMp[] } | Errore> {
  const parsed = uuidSchema.safeParse(lottoId);
  if (!parsed.success) return { success: false, error: "Lotto non valido." };
  await accessoLotti();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_mp_lotto_eventi")
    .select("id, tipo, quantita, unita, da_stato, a_stato, motivazione, created_at")
    .eq("lotto_id", parsed.data)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: "Movimenti del lotto non disponibili." };
  const ids = (data ?? []).map((row) => String(row.id));
  const { data: movimenti } = ids.length
    ? await supabase
        .from("magazzino_movimenti")
        .select("id, lotto_evento_id, tipo")
        .in("lotto_evento_id", ids)
    : { data: [] };
  const perEvento = new Map(
    (movimenti ?? []).map((row) => [String(row.lotto_evento_id), `${row.tipo} ${row.id}`])
  );
  return {
    success: true,
    eventi: (data ?? []).map((row) => ({
      id: String(row.id),
      tipo: String(row.tipo),
      quantita: Number(row.quantita),
      unita: String(row.unita),
      da: row.da_stato ? String(row.da_stato) : null,
      a: row.a_stato ? String(row.a_stato) : null,
      motivazione: String(row.motivazione ?? ""),
      createdAt: String(row.created_at),
      movimento: perEvento.get(String(row.id)) ?? null,
    })),
  };
}

export async function accettaLottoMpAction(raw: unknown): Promise<
  { success: true; riusata: boolean } | Errore
> {
  const parsed = z
    .object({ lottoId: uuidSchema, quantita: qtySchema, chiave: chiaveSchema })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Accettazione non valida." };
  await accessoLotti();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("magazzino_mp_accetta_lotto", {
    p_lotto_id: parsed.data.lottoId,
    p_quantita: parsed.data.quantita,
    p_chiave: parsed.data.chiave,
  });
  if (error) return { success: false, error: messaggioDb(error, "Accettazione non registrata.") };
  const corpo = (data ?? {}) as { riusata?: boolean };
  return { success: true, riusata: Boolean(corpo.riusata) };
}

export async function decidiLottoMpAction(raw: unknown): Promise<
  { success: true; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      lottoId: uuidSchema,
      azione: z.enum(["blocca", "sblocca", "respingi", "uscita"]),
      daStato: z.enum(["in_controllo", "bloccata"]).optional(),
      quantita: qtySchema,
      chiave: chiaveSchema,
      motivazione: z.string().trim().min(3).max(500),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Decisione non valida." };
  await accessoLotti();
  const supabase = await createClient();
  const comune = {
    p_lotto_id: parsed.data.lottoId,
    p_quantita: parsed.data.quantita,
    p_chiave: parsed.data.chiave,
    p_motivazione: parsed.data.motivazione,
  };
  let chiamata;
  if (parsed.data.azione === "blocca") {
    chiamata = supabase.rpc("magazzino_mp_blocca_lotto", comune);
  } else if (parsed.data.azione === "sblocca") {
    chiamata = supabase.rpc("magazzino_mp_sblocca_lotto", comune);
  } else if (parsed.data.azione === "uscita") {
    chiamata = supabase.rpc("magazzino_mp_uscita_respinta_lotto", comune);
  } else {
    chiamata = supabase.rpc("magazzino_mp_respingi_lotto", {
      ...comune,
      p_da_stato: parsed.data.daStato ?? "in_controllo",
    });
  }
  const { data, error } = await chiamata;
  if (error) return { success: false, error: messaggioDb(error, "Decisione non registrata.") };
  const corpo = (data ?? {}) as { riusata?: boolean };
  return { success: true, riusata: Boolean(corpo.riusata) };
}

export type FoglioLavorazioneAperto = { id: string; codice: string; prodotto: string };

export async function listaPrelievoMpAction(): Promise<
  | {
      success: true;
      lotti: LottoMpRiga[];
      fogli: FoglioLavorazioneAperto[];
    }
  | Errore
> {
  const lotti = await listaLottiMpAction();
  if (!lotti.success) return lotti;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_fogli_lavorazione")
    .select("id, codice, prodotto")
    .eq("stato", "aperto")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { success: false, error: "Fogli di lavorazione non disponibili." };
  return {
    success: true,
    lotti: lotti.lotti.filter((lotto) => lotto.disponibile > 0),
    fogli: (data ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
      prodotto: String(row.prodotto ?? ""),
    })),
  };
}

export async function prelevaLottoMpAction(raw: unknown): Promise<
  { success: true; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      lottoId: uuidSchema,
      foglioLavorazioneId: uuidSchema,
      quantita: qtySchema,
      chiave: chiaveSchema,
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Prelievo non valido." };
  await accessoLotti();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("magazzino_mp_preleva_lotto", {
    p_lotto_id: parsed.data.lottoId,
    p_quantita: parsed.data.quantita,
    p_chiave: parsed.data.chiave,
    p_foglio_lavorazione_id: parsed.data.foglioLavorazioneId,
  });
  if (error) return { success: false, error: messaggioDb(error, "Prelievo non registrato.") };
  const corpo = (data ?? {}) as { riusata?: boolean };
  return { success: true, riusata: Boolean(corpo.riusata) };
}
