"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { normalizzaUnitaApprovvigionamento } from "@/lib/produzione/unita-approvvigionamento";
import {
  presaCheCopreVersione,
  riepilogoApprovvigionamento,
  type RigaRiepilogoApprovvigionamento,
  type VoceRiepilogo,
} from "@/lib/produzione/approvvigionamento";
import { bilancioVersione } from "@/lib/produzione/carichi";
import { primoIndirizzoEmail } from "@/lib/produzione/haccp-versioni";
import { inviaDaCasellaAnagrafica } from "@/lib/anagrafica/casella-invio";
import { eseguiNotificaDistribuzione } from "@/lib/produzione/notifica-distribuzione-invio";
import { preparaEmailProva } from "@/lib/produzione/revisione-piano";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const giornoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const chiaveSchema = z.string().trim().min(8).max(80);

const rigaSchema = z.object({
  materiaPrimaId: uuidSchema,
  quantita: z.number().positive().max(1_000_000),
  unitaMisura: z.string().trim().refine(
    (valore) => normalizzaUnitaApprovvigionamento(valore).ok,
    "Unità non prevista."
  ),
  unitaNome: z.string().trim().max(40).optional().default(""),
  tipoQuantita: z.enum(["precisa", "stimata"]).optional().default("precisa"),
  note: z.string().trim().max(500).optional().default(""),
});

const ordineSchema = z.object({
  fornitoreId: uuidSchema,
  dataConsegna: giornoSchema,
  note: z.string().trim().max(2000).optional().default(""),
  origineOrdineId: uuidSchema.nullable().optional(),
  righe: z.array(rigaSchema).min(1).max(40),
  pianificazione: z
    .object({
      tipologia: z.enum(["regolare", "personalizzata", "giorni_fissi"]),
      cadenzaGiorni: z.number().int().positive().nullable(),
      tipoQuantita: z.enum(["precisa", "stimata"]),
      periodoInizio: giornoSchema,
      periodoFine: giornoSchema,
    })
    .optional(),
});

type Errore = { success: false; error: string };

export type OrdineCalendario = {
  id: string;
  codice: string;
  fornitoreId: string;
  fornitore: string;
  dataConsegna: string;
  note: string;
  stato: "bozza" | "pubblicato" | "da_ripubblicare" | "annullato";
  versionePubblicata: number | null;
  versioneId: string | null;
  notificaStato: "assente" | "non_inviata" | "in_invio" | "inviata" | "fallita" | "incerta";
  notificaId: string | null;
  visionatoDa: string | null;
  visionatoAt: string | null;
  visioneOrigine: "ordine" | "piano" | null;
  revisione: number;
  pianoId: string | null;
  pianoCodice: string | null;
  origineOrdineId: string | null;
  confermataDalFornitore: boolean;
  bilancio: {
    codice: string;
    unitaMisura: string;
    ordinata: number;
    ricevuta: number;
    residua: number;
    oltre: boolean;
  }[];
  carichi: {
    id: string;
    codice: string;
    stato: "aperto" | "parziale" | "arrivato";
    versioneNumero: number | null;
    conteggiato: boolean;
    foglioId: string | null;
    foglioCodice: string | null;
  }[];
  righe: {
    id: string;
    materiaPrimaId: string;
    codice: string;
    nome: string;
    quantita: number;
    unitaMisura: string;
    unitaNome?: string;
    tipoQuantita: "precisa" | "stimata";
    note: string;
  }[];
};

export type PianoCalendario = {
  id: string;
  codice: string;
  fornitoreId: string;
  fornitore: string;
  periodoInizio: string;
  periodoFine: string;
  tipologia: "settimanale" | "mensile" | "regolare" | "personalizzata" | "giorni_fissi";
  stato: "bozza" | "pubblicato" | "da_ripubblicare";
  versionePubblicata: number | null;
  versioneId: string | null;
  notificaStato: "assente" | "non_inviata" | "in_invio" | "inviata" | "fallita" | "incerta";
  notificaId: string | null;
  visionatoDa: string | null;
  visionatoAt: string | null;
  revisione: number;
  ordini: string[];
};

export type MateriaCalendario = {
  id: string;
  codice: string;
  nome: string;
  unitaMisura: string | null;
};

function righeCanoniche<T extends { unitaMisura: string }>(righe: T[]): T[] {
  return righe.map((riga) => {
    const unita = normalizzaUnitaApprovvigionamento(riga.unitaMisura);
    return { ...riga, unitaMisura: unita.ok ? unita.sigla : riga.unitaMisura };
  });
}

async function memorizzaNomiUnita(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ordineId: string,
  righe: { unitaNome?: string }[]
) {
  if (!righe.some((riga) => (riga.unitaNome ?? "").trim())) return;
  const { error } = await supabase.rpc("approvvigionamento_nomi_unita", {
    p_ordine_id: ordineId,
    p_righe: righe.map((riga) => ({ unitaNome: (riga.unitaNome ?? "").trim() })),
  });
  if (error) throw new Error("Nome dell'unità non memorizzato.");
}

function messaggioDb(errore: { message?: string } | null, fallback: string): string {
  const testo = errore?.message ?? fallback;
  if (testo.includes("@")) return fallback;
  return testo.replace(/^Errore:\s*/i, "").slice(0, 300);
}

function bilancioDi(
  versioneId: string,
  snapshot: {
    materiaPrimaId: string;
    codice: string;
    unitaMisura: string;
    ordinata: number;
  }[],
  carichi: {
    versioneId: string;
    righe: { rigaId: string; materiaPrimaId: string; quantita: number | null }[];
  }[]
): OrdineCalendario["bilancio"] {
  return bilancioVersione({
    versioneId,
    ordinate: snapshot.map((riga) => ({
      materiaPrimaId: riga.materiaPrimaId,
      codice: riga.codice,
      unitaMisura: riga.unitaMisura,
      quantita: riga.ordinata,
    })),
    carichi,
  }).map(({ codice, unitaMisura, ordinata, ricevuta, residua, oltre }) => ({
    codice,
    unitaMisura,
    ordinata,
    ricevuta,
    residua,
    oltre,
  }));
}

function statoCarico(valore: unknown): "aperto" | "parziale" | "arrivato" {
  if (valore === "arrivato" || valore === "parziale") return valore;
  return "aperto";
}

function tipologiaPiano(valore: unknown): PianoCalendario["tipologia"] {
  if (
    valore === "mensile" ||
    valore === "regolare" ||
    valore === "personalizzata" ||
    valore === "giorni_fissi"
  ) {
    return valore;
  }
  return "settimanale";
}

function statoOrdine(
  valore: unknown
): "bozza" | "pubblicato" | "da_ripubblicare" | "annullato" {
  if (valore === "pubblicato" || valore === "da_ripubblicare" || valore === "annullato") {
    return valore;
  }
  return "bozza";
}

function statoPiano(valore: unknown): PianoCalendario["stato"] {
  if (valore === "pubblicato" || valore === "da_ripubblicare") return valore;
  return "bozza";
}

function notificaDi(
  valore: string | undefined
): "assente" | "non_inviata" | "in_invio" | "inviata" | "fallita" | "incerta" {
  if (
    valore === "non_inviata" ||
    valore === "in_invio" ||
    valore === "inviata" ||
    valore === "fallita" ||
    valore === "incerta"
  ) {
    return valore;
  }
  return "assente";
}

async function nomiDiProfili(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<Map<string, string>> {
  const unici = [...new Set(ids.filter(Boolean))];
  if (!unici.length) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unici);
  return new Map(
    (data ?? []).map((row) => [String(row.id), String(row.full_name || "Utente collegato")])
  );
}

function comeOggetto(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return (data[0] ?? {}) as Record<string, unknown>;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return {};
}

async function richiedi() {
  const { auth } = await requireAreaAccess("produzione");
  return auth;
}

export async function listaMaterieApprovvigionamentoAction(): Promise<
  { success: true; materie: MateriaCalendario[] } | Errore
> {
  await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materie_prime")
    .select("id, codice, nome, unita_misura")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: "Catalogo materie prime non disponibile." };
  return {
    success: true,
    materie: (data ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
      nome: String(row.nome),
      unitaMisura: row.unita_misura ? String(row.unita_misura) : null,
    })),
  };
}

export async function fornitoriCompatibiliApprovvigionamentoAction(
  materiaIds: string[]
): Promise<{ success: true; fornitori: { id: string; nome: string; targa: string }[] } | Errore> {
  await richiedi();
  const ids = [...new Set(materiaIds)].filter((id) => uuidSchema.safeParse(id).success);
  if (!ids.length) return { success: true, fornitori: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fornitori_compatibili_approvvigionamento", {
    p_materie: ids,
  });
  if (error) return { success: false, error: messaggioDb(error, "Fornitori non disponibili.") };
  const righe = Array.isArray(data) ? data : [];
  return {
    success: true,
    fornitori: righe.map((row) => ({
      id: String(row.id),
      nome: String(row.ragione_sociale),
      targa: String(row.codice_targa ?? ""),
    })),
  };
}

export async function listaOrdiniApprovvigionamentoAction(input: {
  da: string;
  a: string;
}): Promise<{ success: true; ordini: OrdineCalendario[] } | Errore> {
  await richiedi();
  const da = giornoSchema.safeParse(input.da);
  const a = giornoSchema.safeParse(input.a);
  if (!da.success || !a.success) return { success: false, error: "Periodo non valido." };
  const supabase = await createClient();
  const { data: ordini, error } = await supabase
    .from("approvvigionamenti_ordini")
    .select(
      "id, codice, fornitore_id, data_consegna, note, stato, origine_ordine_id, revisione, versione_pubblicata"
    )
    .is("deleted_at", null)
    .gte("data_consegna", da.data)
    .lte("data_consegna", a.data)
    .order("data_consegna", { ascending: true });
  if (error) return { success: false, error: "Ordini non disponibili." };
  const ids = (ordini ?? []).map((row) => String(row.id));
  const fornitoreIds = [...new Set((ordini ?? []).map((row) => String(row.fornitore_id)))];
  const { data: collegamenti } = ids.length
    ? await supabase
        .from("approvvigionamenti_piani_ordini")
        .select("piano_id, ordine_id")
        .in("ordine_id", ids)
    : { data: [] };
  const pianoIds = [...new Set((collegamenti ?? []).map((row) => String(row.piano_id)))];
  const { data: piani } = pianoIds.length
    ? await supabase.from("approvvigionamenti_piani").select("id, codice").in("id", pianoIds)
    : { data: [] };
  const codicePiano = new Map((piani ?? []).map((row) => [String(row.id), String(row.codice)]));
  const pianoPerOrdine = new Map(
    (collegamenti ?? []).map((row) => [String(row.ordine_id), String(row.piano_id)])
  );
  const [righeRes, fornitoriRes] = await Promise.all([
    ids.length
      ? supabase
          .from("approvvigionamenti_righe")
          .select("id, ordine_id, materia_prima_id, quantita, unita_misura, unita_nome, tipo_quantita, note, sort_order")
          .in("ordine_id", ids)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    fornitoreIds.length
      ? supabase
          .from("fornitori")
          .select("id, ragione_sociale")
          .in("id", fornitoreIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (righeRes.error || fornitoriRes.error) {
    return { success: false, error: "Dettaglio ordini non disponibile." };
  }
  const materiaIds = [...new Set((righeRes.data ?? []).map((row) => String(row.materia_prima_id)))];
  const { data: materie } = materiaIds.length
    ? await supabase.from("materie_prime").select("id, codice, nome").in("id", materiaIds)
    : { data: [] };
  const nomiMaterie = new Map(
    (materie ?? []).map((row) => [String(row.id), { codice: String(row.codice), nome: String(row.nome) }])
  );
  const nomiFornitori = new Map(
    (fornitoriRes.data ?? []).map((row) => [String(row.id), String(row.ragione_sociale)])
  );
  const pubblicati = (ordini ?? []).filter((row) => row.versione_pubblicata != null);
  const { data: versioni } = pubblicati.length
    ? await supabase
        .from("approvvigionamenti_versioni")
        .select("id, ordine_id, numero")
        .in(
          "ordine_id",
          pubblicati.map((row) => String(row.id))
        )
    : { data: [] };
  const versioneCorrente = new Map<string, string>();
  for (const versione of versioni ?? []) {
    const ordine = pubblicati.find((row) => String(row.id) === String(versione.ordine_id));
    if (ordine && Number(versione.numero) === Number(ordine.versione_pubblicata)) {
      versioneCorrente.set(String(versione.ordine_id), String(versione.id));
    }
  }
  const versioneIds = [...versioneCorrente.values()];
  const [{ data: notifiche }, { data: prese }, { data: presePiano }, { data: conferme }] = await Promise.all([
    versioneIds.length
      ? supabase
          .from("approvvigionamenti_notifiche")
          .select("id, versione_ordine_id, notifica_stato")
          .in("versione_ordine_id", versioneIds)
      : Promise.resolve({ data: [] }),
    versioneIds.length
      ? supabase
          .from("approvvigionamenti_prese_visione")
          .select("versione_ordine_id, profile_id, confermata_at")
          .in("versione_ordine_id", versioneIds)
      : Promise.resolve({ data: [] }),
    fornitoreIds.length
      ? supabase
          .from("approvvigionamenti_prese_visione")
          .select("profile_id, confermata_at, copertura")
          .not("versione_piano_id", "is", null)
          .in("fornitore_id", fornitoreIds)
      : Promise.resolve({ data: [] }),
    versioneIds.length
      ? supabase
          .from("approvvigionamenti_risposte_fornitore")
          .select("versione_id")
          .in("versione_id", versioneIds)
          .eq("tipo", "conferma")
          .eq("stato", "accettata")
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);
  const notificaPerVersione = new Map(
    (notifiche ?? []).map((row) => [
      String(row.versione_ordine_id),
      { id: String(row.id), stato: String(row.notifica_stato) },
    ])
  );
  const dirette = (prese ?? []).map((row) => ({
    versioneId: String(row.versione_ordine_id),
    profileId: String(row.profile_id),
    at: String(row.confermata_at),
  }));
  const pianiCopertura = (presePiano ?? []).map((row) => ({
    profileId: String(row.profile_id),
    at: String(row.confermata_at),
    copertura: Array.isArray(row.copertura)
      ? row.copertura.map((voce) => {
          const riga = voce as { versioneId?: string };
          return { versioneId: riga.versioneId };
        })
      : [],
  }));
  const coperturaPerVersione = new Map<
    string,
    { profileId: string; at: string; origine: "ordine" | "piano" }
  >();
  for (const versioneId of versioneIds) {
    const trovata = presaCheCopreVersione({
      versioneId,
      dirette,
      piani: pianiCopertura,
    });
    if (trovata) coperturaPerVersione.set(versioneId, trovata);
  }
  const confermate = new Set((conferme ?? []).map((row) => String(row.versione_id)));
  const nomiProfili = await nomiDiProfili(
    supabase,
    [...coperturaPerVersione.values()].map((voce) => voce.profileId)
  );
  const righePerOrdine = new Map<string, OrdineCalendario["righe"]>();
  for (const row of righeRes.data ?? []) {
    const ordineId = String(row.ordine_id);
    const materia = nomiMaterie.get(String(row.materia_prima_id));
    const lista = righePerOrdine.get(ordineId) ?? [];
    lista.push({
      id: String(row.id),
      materiaPrimaId: String(row.materia_prima_id),
      codice: materia?.codice ?? "",
      nome: materia?.nome ?? "Materia prima",
      quantita: Number(row.quantita),
      unitaMisura: String(row.unita_misura),
      unitaNome: row.unita_nome ? String(row.unita_nome) : "",
      tipoQuantita: row.tipo_quantita === "stimata" ? "stimata" : "precisa",
      note: String(row.note ?? ""),
    });
    righePerOrdine.set(ordineId, lista);
  }
  const { data: carichiRows } = ids.length
    ? await supabase
        .from("approvvigionamenti_carichi")
        .select("id, codice, ordine_id, versione_id, stato, foglio_id")
        .in("ordine_id", ids)
        .is("deleted_at", null)
    : { data: [] };
  const caricoIds = (carichiRows ?? []).map((row) => String(row.id));
  const foglioIds = (carichiRows ?? []).map((row) => row.foglio_id).filter(Boolean);
  const [{ data: righeCarico }, { data: fogliCarico }, { data: snapshot }] = await Promise.all([
    caricoIds.length
      ? supabase
          .from("approvvigionamenti_carichi_righe")
          .select("id, carico_id, materia_prima_id, quantita_arrivata")
          .in("carico_id", caricoIds)
      : Promise.resolve({ data: [] }),
    foglioIds.length
      ? supabase.from("haccp_fogli_ingresso").select("id, codice").in("id", foglioIds)
      : Promise.resolve({ data: [] }),
    versioneIds.length || caricoIds.length
      ? supabase
          .from("approvvigionamenti_versioni")
          .select("id, numero, righe")
          .in("id", [
            ...new Set([
              ...versioneIds,
              ...(carichiRows ?? []).map((row) => String(row.versione_id)),
            ]),
          ])
      : Promise.resolve({ data: [] }),
  ]);
  const codiceFoglio = new Map(
    (fogliCarico ?? []).map((row) => [String(row.id), String(row.codice)])
  );
  const numeroVersione = new Map(
    (snapshot ?? []).map((row) => [String(row.id), Number(row.numero)])
  );
  const carichiPerOrdine = new Map<string, OrdineCalendario["carichi"]>();
  const carichiBilancio = new Map<
    string,
    { versioneId: string; righe: { rigaId: string; materiaPrimaId: string; quantita: number | null }[] }[]
  >();
  for (const row of carichiRows ?? []) {
    const ordineId = String(row.ordine_id);
    const versioneId = String(row.versione_id);
    const lista = carichiPerOrdine.get(ordineId) ?? [];
    lista.push({
      id: String(row.id),
      codice: String(row.codice),
      stato: statoCarico(row.stato),
      versioneNumero: numeroVersione.get(versioneId) ?? null,
      conteggiato: versioneId === (versioneCorrente.get(ordineId) ?? ""),
      foglioId: row.foglio_id ? String(row.foglio_id) : null,
      foglioCodice: row.foglio_id ? codiceFoglio.get(String(row.foglio_id)) ?? null : null,
    });
    carichiPerOrdine.set(ordineId, lista);
    const bilancio = carichiBilancio.get(ordineId) ?? [];
    bilancio.push({
      versioneId,
      righe: (righeCarico ?? [])
        .filter((riga) => String(riga.carico_id) === String(row.id))
        .map((riga) => ({
          rigaId: String(riga.id),
          materiaPrimaId: String(riga.materia_prima_id),
          quantita: riga.quantita_arrivata == null ? null : Number(riga.quantita_arrivata),
        })),
    });
    carichiBilancio.set(ordineId, bilancio);
  }
  const snapshotPerVersione = new Map<
    string,
    { materiaPrimaId: string; codice: string; unitaMisura: string; ordinata: number }[]
  >();
  for (const row of snapshot ?? []) {
    const righe = Array.isArray(row.righe) ? row.righe : [];
    snapshotPerVersione.set(
      String(row.id),
      righe.map((voce) => {
        const riga = voce as { materiaPrimaId?: string; codice?: string; unitaMisura?: string; quantita?: number };
        return {
          materiaPrimaId: String(riga.materiaPrimaId ?? ""),
          codice: String(riga.codice ?? ""),
          unitaMisura: String(riga.unitaMisura ?? ""),
          ordinata: Number(riga.quantita ?? 0),
        };
      })
    );
  }
  return {
    success: true,
    ordini: (ordini ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
      fornitoreId: String(row.fornitore_id),
      fornitore: nomiFornitori.get(String(row.fornitore_id)) ?? "Fornitore",
      dataConsegna: String(row.data_consegna),
      note: String(row.note ?? ""),
      stato: statoOrdine(row.stato),
      versionePubblicata: row.versione_pubblicata == null ? null : Number(row.versione_pubblicata),
      versioneId: versioneCorrente.get(String(row.id)) ?? null,
      notificaStato: notificaDi(notificaPerVersione.get(versioneCorrente.get(String(row.id)) ?? "")?.stato),
      notificaId: notificaPerVersione.get(versioneCorrente.get(String(row.id)) ?? "")?.id ?? null,
      visionatoDa:
        nomiProfili.get(coperturaPerVersione.get(versioneCorrente.get(String(row.id)) ?? "")?.profileId ?? "") ??
        null,
      visionatoAt: coperturaPerVersione.get(versioneCorrente.get(String(row.id)) ?? "")?.at ?? null,
      visioneOrigine: coperturaPerVersione.get(versioneCorrente.get(String(row.id)) ?? "")?.origine ?? null,
      revisione: Number(row.revisione ?? 1),
      pianoId: pianoPerOrdine.get(String(row.id)) ?? null,
      pianoCodice: codicePiano.get(pianoPerOrdine.get(String(row.id)) ?? "") ?? null,
      origineOrdineId: row.origine_ordine_id ? String(row.origine_ordine_id) : null,
      confermataDalFornitore: confermate.has(versioneCorrente.get(String(row.id)) ?? ""),
      bilancio: bilancioDi(
        versioneCorrente.get(String(row.id)) ?? "",
        snapshotPerVersione.get(versioneCorrente.get(String(row.id)) ?? "") ?? [],
        carichiBilancio.get(String(row.id)) ?? []
      ),
      carichi: carichiPerOrdine.get(String(row.id)) ?? [],
      righe: righePerOrdine.get(String(row.id)) ?? [],
    })),
  };
}

export async function listaPianiApprovvigionamentoAction(input: {
  da: string;
  a: string;
}): Promise<{ success: true; piani: PianoCalendario[] } | Errore> {
  await richiedi();
  const da = giornoSchema.safeParse(input.da);
  const a = giornoSchema.safeParse(input.a);
  if (!da.success || !a.success) return { success: false, error: "Periodo non valido." };
  const supabase = await createClient();
  const { data: piani, error } = await supabase
    .from("approvvigionamenti_piani")
    .select(
      "id, codice, fornitore_id, periodo_inizio, periodo_fine, tipologia, revisione, stato, versione_pubblicata"
    )
    .is("deleted_at", null)
    .lte("periodo_inizio", a.data)
    .gte("periodo_fine", da.data)
    .order("periodo_inizio", { ascending: true });
  if (error) return { success: false, error: "Piani non disponibili." };
  const ids = (piani ?? []).map((row) => String(row.id));
  const fornitoreIds = [...new Set((piani ?? []).map((row) => String(row.fornitore_id)))];
  const [linkRes, fornitoriRes] = await Promise.all([
    ids.length
      ? supabase
          .from("approvvigionamenti_piani_ordini")
          .select("piano_id, ordine_id")
          .in("piano_id", ids)
      : Promise.resolve({ data: [], error: null }),
    fornitoreIds.length
      ? supabase.from("fornitori").select("id, ragione_sociale").in("id", fornitoreIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linkRes.error || fornitoriRes.error) {
    return { success: false, error: "Composizione dei piani non disponibile." };
  }
  const nomi = new Map(
    (fornitoriRes.data ?? []).map((row) => [String(row.id), String(row.ragione_sociale)])
  );
  const ordiniPerPiano = new Map<string, string[]>();
  for (const row of linkRes.data ?? []) {
    const pianoId = String(row.piano_id);
    const lista = ordiniPerPiano.get(pianoId) ?? [];
    lista.push(String(row.ordine_id));
    ordiniPerPiano.set(pianoId, lista);
  }
  const pubblicati = (piani ?? []).filter((row) => row.versione_pubblicata != null);
  const { data: versioniPiano } = pubblicati.length
    ? await supabase
        .from("approvvigionamenti_piani_versioni")
        .select("id, piano_id, numero")
        .in(
          "piano_id",
          pubblicati.map((row) => String(row.id))
        )
    : { data: [] };
  const versionePiano = new Map<string, string>();
  for (const versione of versioniPiano ?? []) {
    const piano = pubblicati.find((row) => String(row.id) === String(versione.piano_id));
    if (piano && Number(versione.numero) === Number(piano.versione_pubblicata)) {
      versionePiano.set(String(versione.piano_id), String(versione.id));
    }
  }
  const versioneIds = [...versionePiano.values()];
  const [{ data: notifichePiano }, { data: presePiano }] = await Promise.all([
    versioneIds.length
      ? supabase
          .from("approvvigionamenti_notifiche")
          .select("id, versione_piano_id, notifica_stato")
          .in("versione_piano_id", versioneIds)
      : Promise.resolve({ data: [] }),
    versioneIds.length
      ? supabase
          .from("approvvigionamenti_prese_visione")
          .select("versione_piano_id, profile_id, confermata_at")
          .in("versione_piano_id", versioneIds)
      : Promise.resolve({ data: [] }),
  ]);
  const notificaPiano = new Map(
    (notifichePiano ?? []).map((row) => [
      String(row.versione_piano_id),
      { id: String(row.id), stato: String(row.notifica_stato) },
    ])
  );
  const presaPiano = new Map<string, { profileId: string; at: string }>();
  for (const row of presePiano ?? []) {
    presaPiano.set(String(row.versione_piano_id), {
      profileId: String(row.profile_id),
      at: String(row.confermata_at),
    });
  }
  const nomiProfiliPiano = await nomiDiProfili(
    supabase,
    [...presaPiano.values()].map((voce) => voce.profileId)
  );
  return {
    success: true,
    piani: (piani ?? []).map((row) => {
      const versioneId = versionePiano.get(String(row.id)) ?? null;
      const presa = presaPiano.get(versioneId ?? "");
      return {
        id: String(row.id),
        codice: String(row.codice),
        fornitoreId: String(row.fornitore_id),
        fornitore: nomi.get(String(row.fornitore_id)) ?? "Fornitore",
        periodoInizio: String(row.periodo_inizio),
        periodoFine: String(row.periodo_fine),
        tipologia: tipologiaPiano(row.tipologia),
        stato: statoPiano(row.stato),
        versionePubblicata: row.versione_pubblicata == null ? null : Number(row.versione_pubblicata),
        versioneId,
        notificaStato: notificaDi(notificaPiano.get(versioneId ?? "")?.stato),
        notificaId: notificaPiano.get(versioneId ?? "")?.id ?? null,
        visionatoDa: nomiProfiliPiano.get(presa?.profileId ?? "") ?? null,
        visionatoAt: presa?.at ?? null,
        revisione: Number(row.revisione ?? 1),
        ordini: ordiniPerPiano.get(String(row.id)) ?? [],
      };
    }),
  };
}

export async function salvaApprovvigionamentiAction(raw: unknown): Promise<
  {
    success: true;
    riusata: boolean;
    ordini: { id: string; codice: string; dataConsegna: string }[];
    piani: { id: string; codice: string; tipologia: string }[];
  } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      tipo: z.enum(["crea", "copia", "settimana", "piano", "pianificazione"]),
      ordini: z.array(ordineSchema).min(1).max(200),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Ordine non valido." };
  }
  const auth = await richiedi();
  const supabase = await createClient();
  const ordiniRichiesti = parsed.data.ordini.map((ordine) => ({
    ...ordine,
    righe: righeCanoniche(ordine.righe),
  }));
  const { data, error } = await supabase.rpc("registra_approvvigionamenti", {
    p_chiave: parsed.data.chiave,
    p_tipo: parsed.data.tipo,
    p_ordini: ordiniRichiesti,
  });
  if (error) return { success: false, error: messaggioDb(error, "Registrazione non riuscita.") };
  const corpo = comeOggetto(data);
  const ordini = Array.isArray(corpo.ordini)
    ? corpo.ordini.map((voce) => {
        const riga = voce as { id?: string; codice?: string; dataConsegna?: string };
        return {
          id: String(riga.id),
          codice: String(riga.codice),
          dataConsegna: String(riga.dataConsegna),
        };
      })
    : [];
  const piani = Array.isArray(corpo.piani)
    ? corpo.piani.map((voce) => {
        const riga = voce as { id?: string; codice?: string; tipologia?: string };
        return {
          id: String(riga.id),
          codice: String(riga.codice),
          tipologia: String(riga.tipologia ?? ""),
        };
      })
    : [];
  await writeAuditLog({
    entity_type: "approvvigionamenti_ordini",
    entity_id: ordini[0]?.id ?? parsed.data.chiave,
    action: parsed.data.tipo,
    actor_id: auth.userId,
    summary: corpo.riusata
      ? "Operazione già registrata: nessun nuovo ordine."
      : `Registrate ${ordini.length} bozze di approvvigionamento.`,
    payload: { riusata: Boolean(corpo.riusata), ordini: ordini.length, piani: piani.length },
  });
  if (!corpo.riusata) {
    for (const salvato of ordini) {
      const richiesto = ordiniRichiesti.find((ordine) => ordine.dataConsegna === salvato.dataConsegna);
      if (!richiesto) continue;
      try {
        await memorizzaNomiUnita(supabase, salvato.id, richiesto.righe);
      } catch (errore) {
        return { success: false, error: errore instanceof Error ? errore.message : "Nome dell'unità non memorizzato." };
      }
    }
  }
  return { success: true, riusata: Boolean(corpo.riusata), ordini, piani };
}

export async function aggiornaApprovvigionamentoAction(raw: unknown): Promise<
  { success: true; riusata: boolean; revisione: number } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      ordineId: uuidSchema,
      revisione: z.number().int().positive(),
      ordine: ordineSchema,
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Modifica non valida." };
  }
  const auth = await richiedi();
  const supabase = await createClient();
  const ordineRichiesto = {
    ...parsed.data.ordine,
    righe: righeCanoniche(parsed.data.ordine.righe),
  };
  const { data, error } = await supabase.rpc("aggiorna_approvvigionamento", {
    p_chiave: parsed.data.chiave,
    p_ordine_id: parsed.data.ordineId,
    p_ordine: ordineRichiesto,
    p_revisione: parsed.data.revisione,
  });
  if (error) return { success: false, error: messaggioDb(error, "Modifica non riuscita.") };
  const corpo = comeOggetto(data);
  await writeAuditLog({
    entity_type: "approvvigionamenti_ordini",
    entity_id: parsed.data.ordineId,
    action: "aggiorna",
    actor_id: auth.userId,
    summary: corpo.riusata
      ? "Modifica già registrata."
      : "Bozza di approvvigionamento aggiornata.",
    payload: { riusata: Boolean(corpo.riusata) },
  });
  if (!corpo.riusata) {
    try {
      await memorizzaNomiUnita(supabase, parsed.data.ordineId, ordineRichiesto.righe);
    } catch (errore) {
      return { success: false, error: errore instanceof Error ? errore.message : "Nome dell'unità non memorizzato." };
    }
  }
  return {
    success: true,
    riusata: Boolean(corpo.riusata),
    revisione: Number(corpo.revisione ?? parsed.data.revisione),
  };
}

export async function aggiornaComposizionePianoAction(raw: unknown): Promise<
  { success: true; riusata: boolean; revisione: number } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      pianoId: uuidSchema,
      revisione: z.number().int().positive(),
      ordineIds: z.array(uuidSchema).min(1).max(200),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Composizione non valida." };
  }
  const auth = await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aggiorna_composizione_piano", {
    p_chiave: parsed.data.chiave,
    p_piano_id: parsed.data.pianoId,
    p_revisione: parsed.data.revisione,
    p_ordini: [...new Set(parsed.data.ordineIds)],
  });
  if (error) return { success: false, error: messaggioDb(error, "Composizione non salvata.") };
  const corpo = comeOggetto(data);
  await writeAuditLog({
    entity_type: "approvvigionamenti_piani",
    entity_id: parsed.data.pianoId,
    action: "composizione",
    actor_id: auth.userId,
    summary: corpo.riusata
      ? "Composizione già registrata."
      : "Composizione del piano aggiornata.",
    payload: { riusata: Boolean(corpo.riusata), ordini: parsed.data.ordineIds.length },
  });
  return {
    success: true,
    riusata: Boolean(corpo.riusata),
    revisione: Number(corpo.revisione ?? parsed.data.revisione),
  };
}

async function messaggioPortale(notificaId: string): Promise<{
  to: string | null;
  subject: string;
  text: string;
}> {
  const supabase = await createClient();
  const { data: notifica } = await supabase
    .from("approvvigionamenti_notifiche")
    .select("fornitore_id")
    .eq("id", notificaId)
    .maybeSingle();
  const { data: fornitore } = await supabase
    .from("fornitori")
    .select("email")
    .eq("id", notifica?.fornitore_id ?? "")
    .maybeSingle();
  return {
    to: primoIndirizzoEmail(String(fornitore?.email ?? "")),
    subject: "Ordine di approvvigionamento disponibile",
    text: [
      "Agrinsicilia ha pubblicato un ordine di approvvigionamento.",
      "Si legge dopo l'accesso, in Gestionale fornitori, sezione Ordini ricevuti.",
      "Questa mail e solo l'avviso. Non conferma la lettura, non e un'accettazione e non garantisce la consegna.",
      "",
      "https://www.opuntiaindustry.com/app/area-fornitori/ordini-ricevuti",
    ].join("\n"),
  };
}

async function avvisaPubblicazione(notificaId: string | null, confermaIncerta: boolean) {
  if (!notificaId) return { tipo: "stato" as const, stato: "non_inviata" as const };
  return eseguiNotificaDistribuzione({
    canale: "approvvigionamento",
    distribuzioneId: notificaId,
    confermaIncerta,
    messaggio: () => messaggioPortale(notificaId),
  });
}

export async function pubblicaOrdineApprovvigionamentoAction(raw: unknown): Promise<
  { success: true; numero: number; notifica: string } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      ordineId: uuidSchema,
      revisione: z.number().int().positive(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Pubblicazione non valida." };
  const auth = await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pubblica_approvvigionamento_ordine", {
    p_chiave: parsed.data.chiave,
    p_ordine_id: parsed.data.ordineId,
    p_revisione: parsed.data.revisione,
  });
  if (error) return { success: false, error: messaggioDb(error, "Pubblicazione non riuscita.") };
  const corpo = comeOggetto(data);
  const notificaId = corpo.notificaId ? String(corpo.notificaId) : null;
  const invio = await avvisaPubblicazione(notificaId, false);
  await writeAuditLog({
    entity_type: "approvvigionamenti_versioni",
    entity_id: String(corpo.id ?? parsed.data.ordineId),
    action: "pubblica",
    actor_id: auth.userId,
    summary: "Pubblicata una versione di ordine di approvvigionamento.",
    payload: { numero: Number(corpo.numero ?? 0), notifica: "stato" in invio ? invio.stato : invio.tipo },
  });
  return {
    success: true,
    numero: Number(corpo.numero ?? 0),
    notifica: "stato" in invio ? invio.stato : invio.tipo,
  };
}

export async function pubblicaPianoApprovvigionamentoAction(raw: unknown): Promise<
  { success: true; numero: number; notifica: string } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      pianoId: uuidSchema,
      revisione: z.number().int().positive(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Pubblicazione non valida." };
  const auth = await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pubblica_approvvigionamento_piano", {
    p_chiave: parsed.data.chiave,
    p_piano_id: parsed.data.pianoId,
    p_revisione: parsed.data.revisione,
  });
  if (error) return { success: false, error: messaggioDb(error, "Pubblicazione non riuscita.") };
  const corpo = comeOggetto(data);
  const notificaId = corpo.notificaId ? String(corpo.notificaId) : null;
  const invio = await avvisaPubblicazione(notificaId, false);
  await writeAuditLog({
    entity_type: "approvvigionamenti_piani_versioni",
    entity_id: String(corpo.id ?? parsed.data.pianoId),
    action: "pubblica",
    actor_id: auth.userId,
    summary: "Pubblicata una versione di piano di approvvigionamento.",
    payload: { numero: Number(corpo.numero ?? 0), notifica: "stato" in invio ? invio.stato : invio.tipo },
  });
  return {
    success: true,
    numero: Number(corpo.numero ?? 0),
    notifica: "stato" in invio ? invio.stato : invio.tipo,
  };
}

export async function recuperaNotificaApprovvigionamentoAction(raw: unknown): Promise<
  { success: true; notifica: string } | Errore
> {
  const parsed = z
    .object({ notificaId: uuidSchema, confermaIncerta: z.boolean().optional() })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Notifica non valida." };
  await richiedi();
  const invio = await avvisaPubblicazione(parsed.data.notificaId, Boolean(parsed.data.confermaIncerta));
  if (invio.tipo === "conferma_richiesta") {
    return {
      success: false,
      error: "Esito incerto: serve una conferma esplicita. Il reinvio potrebbe produrre una seconda email.",
    };
  }
  if (invio.tipo === "in_corso") return { success: true, notifica: "in_invio" };
  return { success: true, notifica: invio.stato };
}

export async function differenzeOrdineApprovvigionamentoAction(
  ordineId: string
): Promise<{ success: true; differenze: string[] } | Errore> {
  await richiedi();
  if (!uuidSchema.safeParse(ordineId).success) return { success: false, error: "Ordine non valido." };
  const supabase = await createClient();
  const { data: ordine } = await supabase
    .from("approvvigionamenti_ordini")
    .select("id, data_consegna, versione_pubblicata")
    .eq("id", ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ordine?.versione_pubblicata) return { success: true, differenze: [] };
  const [{ data: versione }, { data: righe }] = await Promise.all([
    supabase
      .from("approvvigionamenti_versioni")
      .select("data_consegna, righe")
      .eq("ordine_id", ordineId)
      .eq("numero", ordine.versione_pubblicata)
      .maybeSingle(),
    supabase
      .from("approvvigionamenti_righe")
      .select("materia_prima_id, quantita, unita_misura, note")
      .eq("ordine_id", ordineId)
      .is("deleted_at", null),
  ]);
  const materiaIds = [...new Set((righe ?? []).map((riga) => String(riga.materia_prima_id)))];
  const { data: materie } = materiaIds.length
    ? await supabase.from("materie_prime").select("id, codice, nome").in("id", materiaIds)
    : { data: [] };
  const nomi = new Map((materie ?? []).map((materia) => [String(materia.id), materia]));
  const { differenzeApprovvigionamento } = await import("@/lib/produzione/approvvigionamento");
  const pubblicate = Array.isArray(versione?.righe) ? versione.righe : [];
  return {
    success: true,
    differenze: differenzeApprovvigionamento({
      dataPrima: String(versione?.data_consegna ?? ""),
      dataDopo: String(ordine.data_consegna),
      righePrima: pubblicate.map((riga) => {
        const voce = riga as {
          materiaPrimaId?: string;
          codice?: string;
          nome?: string;
          quantita?: number;
          unitaMisura?: string;
          note?: string;
        };
        return {
          materiaPrimaId: String(voce.materiaPrimaId ?? ""),
          codice: String(voce.codice ?? ""),
          nome: String(voce.nome ?? ""),
          quantita: Number(voce.quantita ?? 0),
          unitaMisura: String(voce.unitaMisura ?? ""),
          note: String(voce.note ?? ""),
        };
      }),
      righeDopo: (righe ?? []).map((riga) => {
        const materia = nomi.get(String(riga.materia_prima_id));
        return {
          materiaPrimaId: String(riga.materia_prima_id),
          codice: String(materia?.codice ?? ""),
          nome: String(materia?.nome ?? ""),
          quantita: Number(riga.quantita),
          unitaMisura: String(riga.unita_misura),
          note: String(riga.note ?? ""),
        };
      }),
    }),
  };
}

export async function resocontoApprovvigionamentoAction(input: {
  ordineIds: string[];
  materiaId?: string;
}): Promise<
  | {
      success: true;
      consegne: number;
      voci: VoceRiepilogo[];
      righe: Array<
        RigaRiepilogoApprovvigionamento & { data: string; materia: string }
      >;
    }
  | Errore
> {
  await richiedi();
  const ids = [...new Set(input.ordineIds.filter((id) => uuidSchema.safeParse(id).success))].slice(0, 200);
  const materiaFiltro = input.materiaId && uuidSchema.safeParse(input.materiaId).success ? input.materiaId : "";
  if (!ids.length) {
    return {
      success: true,
      righe: [],
      ...riepilogoApprovvigionamento({
        righe: [],
        giacenza: null,
        motivoGiacenza: "Nessuna consegna nel filtro.",
      }),
    };
  }
  const supabase = await createClient();
  const { data: ordini, error } = await supabase
    .from("approvvigionamenti_ordini")
    .select("id, versione_pubblicata, stato, data_consegna")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { success: false, error: "Resoconto non disponibile." };
  const { data: righe } = await supabase
    .from("approvvigionamenti_righe")
    .select("ordine_id, materia_prima_id, quantita, unita_misura, tipo_quantita")
    .in("ordine_id", ids)
    .is("deleted_at", null);
  const materieIds = [
    ...new Set(
      (righe ?? [])
        .map((riga) => String(riga.materia_prima_id))
        .filter((id) => !materiaFiltro || id === materiaFiltro)
    ),
  ];
  const { data: materie } = materieIds.length
    ? await supabase.from("materie_prime").select("id, codice").in("id", materieIds)
    : { data: [] };
  const codiceMateria = new Map((materie ?? []).map((row) => [String(row.id), String(row.codice)]));
  const pubblicati = (ordini ?? []).filter((row) => row.versione_pubblicata != null);
  const { data: versioni } = pubblicati.length
    ? await supabase
        .from("approvvigionamenti_versioni")
        .select("id, ordine_id, numero, righe")
        .in(
          "ordine_id",
          pubblicati.map((row) => String(row.id))
        )
    : { data: [] };
  const versioneCorrente = new Map<string, { id: string; righe: unknown[] }>();
  for (const versione of versioni ?? []) {
    const ordine = pubblicati.find((row) => String(row.id) === String(versione.ordine_id));
    if (ordine && Number(versione.numero) === Number(ordine.versione_pubblicata)) {
      versioneCorrente.set(String(versione.ordine_id), {
        id: String(versione.id),
        righe: Array.isArray(versione.righe) ? versione.righe : [],
      });
    }
  }
  const versioneIds = [...versioneCorrente.values()].map((voce) => voce.id);
  const { data: risposte } = versioneIds.length
    ? await supabase
        .from("approvvigionamenti_risposte_fornitore")
        .select("versione_id, tipo, stato, righe")
        .in("versione_id", versioneIds)
        .eq("stato", "accettata")
        .is("deleted_at", null)
    : { data: [] };
  const rispostaPerVersione = new Map(
    (risposte ?? []).map((row) => [
      String(row.versione_id),
      {
        tipo: String(row.tipo),
        righe: Array.isArray(row.righe) ? row.righe : [],
      },
    ])
  );
  const { data: carichi } = await supabase
    .from("approvvigionamenti_carichi")
    .select("id, ordine_id")
    .in("ordine_id", ids)
    .is("deleted_at", null);
  const caricoIds = (carichi ?? []).map((row) => String(row.id));
  const ordineDelCarico = new Map((carichi ?? []).map((row) => [String(row.id), String(row.ordine_id)]));
  const { data: righeCarico } = caricoIds.length
    ? await supabase
        .from("approvvigionamenti_carichi_righe")
        .select("id, carico_id, materia_prima_id, quantita_arrivata, unita_misura")
        .in("carico_id", caricoIds)
    : { data: [] };
  const { data: lotti } = (righeCarico ?? []).length
    ? await supabase
        .from("magazzino_mp_lotti")
        .select("id, carico_riga_id, unita, materia_prima_id")
        .in(
          "carico_riga_id",
          (righeCarico ?? []).map((row) => String(row.id))
        )
        .is("deleted_at", null)
    : { data: [] };
  const lottoIds = (lotti ?? []).map((row) => String(row.id));
  const { data: conti } = lottoIds.length
    ? await supabase
        .from("magazzino_mp_lotto_quantita")
        .select(
          "lotto_id, quantita_disponibile, quantita_bloccata, quantita_respinta, quantita_consumata_uscita"
        )
        .in("lotto_id", lottoIds)
    : { data: [] };
  const contoPerLotto = new Map((conti ?? []).map((row) => [String(row.lotto_id), row]));
  const lottiPerRiga = new Map<string, typeof lotti>();
  for (const lotto of lotti ?? []) {
    const chiave = String(lotto.carico_riga_id);
    const lista = lottiPerRiga.get(chiave) ?? [];
    lista.push(lotto);
    lottiPerRiga.set(chiave, lista);
  }
  const dataOrdine = new Map(
    (ordini ?? []).map((row) => [String(row.id), String(row.data_consegna ?? "").slice(0, 10)])
  );
  const fatti: RigaRiepilogoApprovvigionamento[] = [];
  const attivi = new Set(
    (ordini ?? [])
      .filter((ordine) => ordine.stato !== "annullato")
      .map((ordine) => String(ordine.id))
  );
  for (const riga of righe ?? []) {
    if (!attivi.has(String(riga.ordine_id))) continue;
    const materiaId = String(riga.materia_prima_id);
    if (materiaFiltro && materiaId !== materiaFiltro) continue;
    const ordineId = String(riga.ordine_id);
    const unita = String(riga.unita_misura);
    const codice = codiceMateria.get(materiaId) ?? "";
    const versione = versioneCorrente.get(ordineId);
    const pubblicate = (versione?.righe ?? []).filter((voce) => {
      const rigaVersione = voce as { materiaPrimaId?: string; unitaMisura?: string };
      return String(rigaVersione.materiaPrimaId ?? "") === materiaId && String(rigaVersione.unitaMisura ?? "") === unita;
    }) as { quantita?: number }[];
    const ordinata = versione
      ? pubblicate.reduce((totale, voce) => totale + Number(voce.quantita ?? 0), 0)
      : 0;
    const risposta = versione ? rispostaPerVersione.get(versione.id) : undefined;
    let confermata = 0;
    if (risposta) {
      const proposte = risposta.righe.filter((voce) => {
        const proposta = voce as { codice?: string; unitaMisura?: string };
        return String(proposta.codice ?? "") === codice && String(proposta.unitaMisura ?? "") === unita;
      }) as { quantita?: number }[];
      if (proposte.length) {
        confermata = proposte.reduce((totale, proposta) => totale + Number(proposta.quantita ?? 0), 0);
      } else if (risposta.tipo === "conferma" && risposta.righe.length === 0) {
        confermata = ordinata;
      }
    }
    const arrivi = (righeCarico ?? []).filter(
      (carico) => ordineDelCarico.get(String(carico.carico_id)) === ordineId && String(carico.materia_prima_id) === materiaId
    );
    const arrivataMancante = arrivi.some((carico) => carico.quantita_arrivata == null);
    const arrivata = arrivi.reduce((totale, carico) => totale + Number(carico.quantita_arrivata ?? 0), 0);
    const lottiRiga = arrivi.flatMap((carico) => lottiPerRiga.get(String(carico.id)) ?? []);
    const unitaLottoDiversa = lottiRiga.some((lotto) => String(lotto.unita) !== unita);
    let accettata = 0;
    let respinta = 0;
    let scaricata = 0;
    for (const lotto of lottiRiga) {
      const conto = contoPerLotto.get(String(lotto.id));
      accettata += Number(conto?.quantita_disponibile ?? 0) + Number(conto?.quantita_bloccata ?? 0) + Number(conto?.quantita_consumata_uscita ?? 0);
      respinta += Number(conto?.quantita_respinta ?? 0);
      scaricata += Number(conto?.quantita_consumata_uscita ?? 0);
    }
    fatti.push({
      ordineId,
      materiaId,
      unita,
      tipoQuantita: riga.tipo_quantita === "stimata" ? "stimata" : "precisa",
      pianificata: Number(riga.quantita),
      ordinata,
      confermata,
      arrivata,
      arrivataMancante,
      accettata,
      respinta,
      scaricata,
      lottiCollegati: lottiRiga.length > 0,
      unitaLottoDiversa,
    });
  }
  let giacenza: { quantita: number; unita: string } | null = null;
  let motivoGiacenza: string | null = null;
  if (materieIds.length !== 1) {
    motivoGiacenza = "Seleziona una materia: la giacenza è del catalogo e non si somma tra materie.";
  } else {
    const { data: saldo } = await supabase
      .from("magazzino_giacenze")
      .select("quantita_kg, unita")
      .eq("catalog_kind", "materia_prima")
      .eq("prodotto_id", materieIds[0])
      .is("deleted_at", null)
      .maybeSingle();
    if (!saldo) {
      motivoGiacenza = "Nessuna giacenza registrata per questa materia.";
    } else {
      giacenza = { quantita: Number(saldo.quantita_kg), unita: String(saldo.unita) };
    }
  }
  return {
    success: true,
    righe: fatti.map((riga) => ({
      ...riga,
      data: dataOrdine.get(riga.ordineId) ?? "",
      materia: codiceMateria.get(riga.materiaId) ?? riga.materiaId,
    })),
    ...riepilogoApprovvigionamento({ righe: fatti, giacenza, motivoGiacenza }),
  };
}

export async function annullaConsegnaApprovvigionamentoAction(raw: unknown): Promise<
  { success: true; riusata: boolean; stato: string } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      ordineId: uuidSchema,
      revisione: z.number().int().positive(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Annullamento non valido." };
  const auth = await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approvvigionamento_annulla_consegna", {
    p_chiave: parsed.data.chiave,
    p_ordine_id: parsed.data.ordineId,
    p_revisione: parsed.data.revisione,
  });
  if (error) return { success: false, error: messaggioDb(error, "Consegna non annullata.") };
  const corpo = comeOggetto(data);
  await writeAuditLog({
    entity_type: "approvvigionamenti_ordini",
    entity_id: parsed.data.ordineId,
    action: "annulla",
    actor_id: auth.userId,
    summary: "Consegna annullata. Le versioni pubblicate restano.",
    payload: { riusata: Boolean(corpo.riusata), stato: String(corpo.stato ?? "") },
  });
  return {
    success: true,
    riusata: Boolean(corpo.riusata),
    stato: String(corpo.stato ?? ""),
  };
}

export async function collegaConsegnaPianoAction(raw: unknown): Promise<
  {
    success: true;
    riusata: boolean;
    revisione: number;
    periodoInizio: string;
    periodoFine: string;
  } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      pianoId: uuidSchema,
      ordineId: uuidSchema,
      revisione: z.number().int().positive(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Collegamento non valido." };
  const auth = await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approvvigionamento_collega_consegna", {
    p_chiave: parsed.data.chiave,
    p_piano_id: parsed.data.pianoId,
    p_ordine_id: parsed.data.ordineId,
    p_revisione: parsed.data.revisione,
  });
  if (error) return { success: false, error: messaggioDb(error, "Consegna non collegata al piano.") };
  const corpo = comeOggetto(data);
  await writeAuditLog({
    entity_type: "approvvigionamenti_piani",
    entity_id: parsed.data.pianoId,
    action: "collega",
    actor_id: auth.userId,
    summary: "Consegna collegata alla pianificazione esistente.",
    payload: { riusata: Boolean(corpo.riusata), ordineId: parsed.data.ordineId },
  });
  return {
    success: true,
    riusata: Boolean(corpo.riusata),
    revisione: Number(corpo.revisione ?? parsed.data.revisione),
    periodoInizio: String(corpo.periodoInizio ?? ""),
    periodoFine: String(corpo.periodoFine ?? ""),
  };
}

export async function estendiPeriodoPianoAction(raw: unknown): Promise<
  { success: true; riusata: boolean; esteso: boolean; revisione: number } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      pianoId: uuidSchema,
      revisione: z.number().int().positive(),
      data: giornoSchema,
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Periodo non valido." };
  const auth = await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approvvigionamento_estendi_periodo_piano", {
    p_chiave: parsed.data.chiave,
    p_piano_id: parsed.data.pianoId,
    p_revisione: parsed.data.revisione,
    p_data: parsed.data.data,
  });
  if (error) return { success: false, error: messaggioDb(error, "Periodo non aggiornato.") };
  const corpo = comeOggetto(data);
  await writeAuditLog({
    entity_type: "approvvigionamenti_piani",
    entity_id: parsed.data.pianoId,
    action: "estendi",
    actor_id: auth.userId,
    summary: "Periodo della pianificazione esistente allargato.",
    payload: { riusata: Boolean(corpo.riusata), esteso: Boolean(corpo.esteso) },
  });
  return {
    success: true,
    riusata: Boolean(corpo.riusata),
    esteso: Boolean(corpo.esteso),
    revisione: Number(corpo.revisione ?? parsed.data.revisione),
  };
}

export async function aggiungiConsegnaPianoAction(raw: unknown): Promise<
  {
    success: true;
    riusata: boolean;
    ordineId: string;
    codice: string;
    revisione: number;
    periodoInizio: string;
    periodoFine: string;
  } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      pianoId: uuidSchema,
      revisione: z.number().int().positive(),
      data: giornoSchema,
      note: z.string().trim().max(2000).optional().default(""),
      righe: z.array(rigaSchema).min(1).max(20),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Consegna non valida." };
  }
  const auth = await richiedi();
  const supabase = await createClient();
  const righeRichieste = righeCanoniche(parsed.data.righe);
  const { data, error } = await supabase.rpc("approvvigionamento_aggiungi_consegna_piano", {
    p_chiave: parsed.data.chiave,
    p_piano_id: parsed.data.pianoId,
    p_revisione: parsed.data.revisione,
    p_data: parsed.data.data,
    p_note: parsed.data.note,
    p_righe: righeRichieste,
  });
  if (error) return { success: false, error: messaggioDb(error, "Consegna non aggiunta.") };
  const corpo = comeOggetto(data);
  const ordineId = String(corpo.ordineId ?? "");
  if (!ordineId) return { success: false, error: "Consegna non aggiunta." };
  await writeAuditLog({
    entity_type: "approvvigionamenti_piani",
    entity_id: parsed.data.pianoId,
    action: "aggiungi",
    actor_id: auth.userId,
    summary: "Consegna creata e collegata alla stessa pianificazione.",
    payload: { riusata: Boolean(corpo.riusata), ordineId },
  });
  if (!corpo.riusata) {
    try {
      await memorizzaNomiUnita(supabase, ordineId, righeRichieste);
    } catch (errore) {
      return { success: false, error: errore instanceof Error ? errore.message : "Nome dell'unità non memorizzato." };
    }
  }
  return {
    success: true,
    riusata: Boolean(corpo.riusata),
    ordineId,
    codice: String(corpo.codice ?? ""),
    revisione: Number(corpo.revisione ?? parsed.data.revisione),
    periodoInizio: String(corpo.periodoInizio ?? ""),
    periodoFine: String(corpo.periodoFine ?? ""),
  };
}

export async function inviaEmailProvaApprovvigionamentoAction(raw: unknown): Promise<
  | { success: true; inviata: boolean; to: string; subject: string; text: string }
  | Errore
> {
  const parsed = z
    .object({
      destinatario: z.string().trim().max(200),
      emailFornitore: z.string().trim().max(200).nullable().optional(),
      codice: z.string().trim().max(40),
      conferma: z.boolean(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Email di prova non valida." };
  await richiedi();
  const preparata = preparaEmailProva({
    destinatario: parsed.data.destinatario,
    emailFornitore: parsed.data.emailFornitore ?? null,
    codice: parsed.data.codice,
    conferma: parsed.data.conferma,
  });
  if (!preparata.ok) return { success: false, error: preparata.motivo };
  const supabase = await createClient();
  const { data: anagrafiche } = await supabase
    .from("fornitori")
    .select("email")
    .ilike("email", preparata.busta.to)
    .limit(1);
  if ((anagrafiche ?? []).length > 0) {
    return { success: false, error: "Questo è l'indirizzo di un fornitore reale. La prova non parte." };
  }
  if (!preparata.busta.invio) {
    return {
      success: true,
      inviata: false,
      to: preparata.busta.to,
      subject: preparata.busta.subject,
      text: preparata.busta.text,
    };
  }
  try {
    await inviaDaCasellaAnagrafica({
      to: preparata.busta.to,
      subject: preparata.busta.subject,
      text: preparata.busta.text,
      soloSmtp: true,
    });
  } catch (errore) {
    const testo = errore instanceof Error ? errore.message : "Email di prova non partita.";
    return { success: false, error: testo.slice(0, 300) };
  }
  return {
    success: true,
    inviata: true,
    to: preparata.busta.to,
    subject: preparata.busta.subject,
    text: preparata.busta.text,
  };
}
