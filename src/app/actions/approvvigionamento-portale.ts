"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { eUtenteInternoHaccp } from "@/lib/produzione/fornitore-accesso";
import { soggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso-server";
import { validaRispostaFornitore } from "@/lib/produzione/risposta-fornitore";
import { risolviAccessoMaterialeIngresso } from "@/lib/produzione/fornitore-accesso";
import {
  etichettaVersionePortale,
  ruoloVersionePortale,
  type RuoloVersionePortale,
} from "@/lib/produzione/approvvigionamento";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

type Errore = { success: false; error: string };

export type VersioneRicevuta = {
  id: string;
  ordineId: string;
  numero: number;
  codice: string;
  dataConsegna: string;
  note: string;
  righe: {
    codice: string;
    nome: string;
    quantita: number;
    unitaMisura: string;
    note: string;
  }[];
  confermataAt: string | null;
  confermataDa: string | null;
  ruolo: RuoloVersionePortale;
  etichetta: string;
  bozzaNonPubblicata: boolean;
  copertaDalPiano: boolean;
  risposta: {
    id: string;
    tipo: string;
    stato: string;
    motivazione: string;
    dataConsegnaProposta: string | null;
  } | null;
};

export type PianoRicevuto = {
  id: string;
  numero: number;
  codice: string;
  tipologia: "settimanale" | "mensile";
  periodoInizio: string;
  periodoFine: string;
  ordini: {
    ordineId: string;
    versioneId: string;
    numero: number;
    codice: string;
    dataConsegna: string;
  }[];
  confermataAt: string | null;
  ruolo: RuoloVersionePortale;
  etichetta: string;
  bozzaNonPubblicata: boolean;
};

async function fornitorePortale(): Promise<{ userId: string; fornitoreId: string } | Errore> {
  const { auth } = await requireAreaAccess("area-fornitori");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto) return { success: false, error: "Accesso non disponibile." };
  const esito = risolviAccessoMaterialeIngresso(soggetto, soggetto.fornitoreCollegatoId);
  if (esito.esito !== "fornitore") {
    return { success: false, error: "Nessuna anagrafica fornitore collegata a questo accesso." };
  }
  return { userId: auth.userId, fornitoreId: esito.fornitoreId };
}

export async function listaOrdiniRicevutiAction(): Promise<
  { success: true; ordini: VersioneRicevuta[]; piani: PianoRicevuto[] } | Errore
> {
  const accesso = await fornitorePortale();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const [{ data: versioni, error }, { data: piani, error: errorePiani }] = await Promise.all([
    supabase
      .from("approvvigionamenti_versioni")
      .select("id, ordine_id, numero, codice, data_consegna, note, righe")
      .eq("fornitore_id", accesso.fornitoreId)
      .order("data_consegna", { ascending: true }),
    supabase
      .from("approvvigionamenti_piani_versioni")
      .select("id, piano_id, numero, codice, tipologia, periodo_inizio, periodo_fine, ordini")
      .eq("fornitore_id", accesso.fornitoreId)
      .order("periodo_inizio", { ascending: true }),
  ]);
  if (error || errorePiani) return { success: false, error: "Ordini ricevuti non disponibili." };
  const { data: segnali, error: erroreSegnali } = await supabase.rpc(
    "approvvigionamenti_segnali_portale"
  );
  if (erroreSegnali) return { success: false, error: "Ordini ricevuti non disponibili." };
  const segnaleOrdine = new Map<string, { numero: number; bozza: boolean }>();
  const segnalePiano = new Map<string, { numero: number; bozza: boolean }>();
  for (const row of segnali ?? []) {
    const voce = row as {
      ambito?: string;
      riferimento_id?: string;
      versione_pubblicata?: number;
      bozza_non_pubblicata?: boolean;
    };
    const destinazione = voce.ambito === "piano" ? segnalePiano : segnaleOrdine;
    destinazione.set(String(voce.riferimento_id), {
      numero: Number(voce.versione_pubblicata),
      bozza: Boolean(voce.bozza_non_pubblicata),
    });
  }
  const versioneIds = (versioni ?? []).map((row) => String(row.id));
  const pianoIds = (piani ?? []).map((row) => String(row.id));
  const { data: prese } = versioneIds.length || pianoIds.length
    ? await supabase
        .from("approvvigionamenti_prese_visione")
        .select("versione_ordine_id, versione_piano_id, profile_id, confermata_at, copertura")
        .eq("fornitore_id", accesso.fornitoreId)
    : { data: [] };
  const presaOrdine = new Map<string, { at: string; profileId: string }>();
  const presaPiano = new Map<string, string>();
  const coperteDalPiano = new Set<string>();
  for (const row of prese ?? []) {
    if (row.versione_ordine_id) {
      presaOrdine.set(String(row.versione_ordine_id), {
        at: String(row.confermata_at),
        profileId: String(row.profile_id),
      });
    }
    if (row.versione_piano_id) presaPiano.set(String(row.versione_piano_id), String(row.confermata_at));
    if (Array.isArray(row.copertura)) {
      for (const voce of row.copertura) {
        const riga = voce as { versioneId?: string };
        if (riga.versioneId) coperteDalPiano.add(String(riga.versioneId));
      }
    }
  }
  const profileIds = [...new Set([...presaOrdine.values()].map((voce) => voce.profileId))];
  const { data: profili } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] };
  const nomi = new Map((profili ?? []).map((row) => [String(row.id), String(row.full_name || "Utente")]));
  const { data: risposte } = versioneIds.length
    ? await supabase
        .from("approvvigionamenti_risposte_fornitore")
        .select("id, versione_id, tipo, stato, motivazione, data_consegna_proposta")
        .in("versione_id", versioneIds)
        .is("deleted_at", null)
    : { data: [] };
  const rispostaPerVersione = new Map(
    (risposte ?? []).map((row) => [String(row.versione_id), row])
  );
  return {
    success: true,
    ordini: (versioni ?? []).map((row) => {
      const presa = presaOrdine.get(String(row.id));
      const righe = Array.isArray(row.righe) ? row.righe : [];
      return {
        id: String(row.id),
        ordineId: String(row.ordine_id),
        numero: Number(row.numero),
        codice: String(row.codice),
        dataConsegna: String(row.data_consegna),
        note: String(row.note ?? ""),
        righe: righe.map((riga) => {
          const voce = riga as {
            codice?: string;
            nome?: string;
            quantita?: number;
            unitaMisura?: string;
            note?: string;
          };
          return {
            codice: String(voce.codice ?? ""),
            nome: String(voce.nome ?? ""),
            quantita: Number(voce.quantita ?? 0),
            unitaMisura: String(voce.unitaMisura ?? ""),
            note: String(voce.note ?? ""),
          };
        }),
        confermataAt: presa?.at ?? null,
        confermataDa: presa ? nomi.get(presa.profileId) ?? "Utente collegato" : null,
        ruolo: ruoloVersionePortale(Number(row.numero), segnaleOrdine.get(String(row.ordine_id))?.numero ?? null),
        etichetta: etichettaVersionePortale(
          ruoloVersionePortale(Number(row.numero), segnaleOrdine.get(String(row.ordine_id))?.numero ?? null)
        ),
        bozzaNonPubblicata:
          ruoloVersionePortale(Number(row.numero), segnaleOrdine.get(String(row.ordine_id))?.numero ?? null) ===
            "corrente" && Boolean(segnaleOrdine.get(String(row.ordine_id))?.bozza),
        copertaDalPiano: coperteDalPiano.has(String(row.id)),
        risposta: (() => {
          const risposta = rispostaPerVersione.get(String(row.id));
          if (!risposta) return null;
          return {
            id: String(risposta.id),
            tipo: String(risposta.tipo),
            stato: String(risposta.stato),
            motivazione: String(risposta.motivazione),
            dataConsegnaProposta: risposta.data_consegna_proposta
              ? String(risposta.data_consegna_proposta)
              : null,
          };
        })(),
      };
    }),
    piani: (piani ?? []).map((row) => {
      const ordini = Array.isArray(row.ordini) ? row.ordini : [];
      return {
        id: String(row.id),
        numero: Number(row.numero),
        codice: String(row.codice),
        tipologia: row.tipologia === "mensile" ? "mensile" : "settimanale",
        periodoInizio: String(row.periodo_inizio),
        periodoFine: String(row.periodo_fine),
        ordini: ordini.map((voce) => {
          const riga = voce as {
            ordineId?: string;
            versioneId?: string;
            numero?: number;
            codice?: string;
            dataConsegna?: string;
          };
          return {
            ordineId: String(riga.ordineId ?? ""),
            versioneId: String(riga.versioneId ?? ""),
            numero: Number(riga.numero ?? 0),
            codice: String(riga.codice ?? ""),
            dataConsegna: String(riga.dataConsegna ?? ""),
          };
        }),
        confermataAt: presaPiano.get(String(row.id)) ?? null,
        ruolo: ruoloVersionePortale(Number(row.numero), segnalePiano.get(String(row.piano_id))?.numero ?? null),
        etichetta: etichettaVersionePortale(
          ruoloVersionePortale(Number(row.numero), segnalePiano.get(String(row.piano_id))?.numero ?? null)
        ),
        bozzaNonPubblicata:
          ruoloVersionePortale(Number(row.numero), segnalePiano.get(String(row.piano_id))?.numero ?? null) ===
            "corrente" && Boolean(segnalePiano.get(String(row.piano_id))?.bozza),
      };
    }),
  };
}

export async function confermaPresaVisioneApprovvigionamentoAction(raw: unknown): Promise<
  { success: true; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      chiave: z.string().trim().min(8).max(80),
      ambito: z.enum(["ordine", "piano"]),
      versioneId: uuidSchema,
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Conferma non valida." };
  const accesso = await fornitorePortale();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conferma_presa_visione_approvvigionamento", {
    p_chiave: parsed.data.chiave,
    p_ambito: parsed.data.ambito,
    p_versione_id: parsed.data.versioneId,
  });
  if (error) return { success: false, error: "Questa versione non è disponibile." };
  const corpo = (data ?? {}) as { riusata?: boolean; id?: string };
  await writeAuditLog({
    entity_type: "approvvigionamenti_prese_visione",
    entity_id: String(corpo.id ?? parsed.data.versioneId),
    action: "presa_visione",
    actor_id: accesso.userId,
    summary: "Presa visione di una versione di approvvigionamento. Non è un'accettazione.",
    payload: { ambito: parsed.data.ambito, riusata: Boolean(corpo.riusata) },
  });
  return { success: true, riusata: Boolean(corpo.riusata) };
}

export async function registraRispostaFornitoreAction(raw: unknown): Promise<
  { success: true; riusata: boolean; stato: string } | Errore
> {
  const parsed = z
    .object({
      chiave: z.string().trim().min(8).max(80),
      versioneId: uuidSchema,
      tipo: z.enum(["conferma", "proposta", "indisponibilita", "rifiuto"]),
      motivazione: z.string().trim().max(500).optional(),
      dataConsegna: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      righe: z
        .array(
          z.object({
            codice: z.string().trim().min(1).max(40),
            quantita: z.number().positive().max(1_000_000),
            unitaMisura: z.string().trim().min(1).max(8),
          })
        )
        .max(40)
        .optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Risposta non valida." };
  const controllo = validaRispostaFornitore({
    tipo: parsed.data.tipo,
    motivazione: parsed.data.motivazione ?? "",
    dataConsegna: parsed.data.dataConsegna ?? null,
    righe: parsed.data.righe ?? [],
  });
  if (!controllo.ok) return { success: false, error: controllo.motivo };
  const accesso = await fornitorePortale();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registra_risposta_fornitore_approvvigionamento", {
    p_chiave: parsed.data.chiave,
    p_versione_id: parsed.data.versioneId,
    p_tipo: parsed.data.tipo,
    p_motivazione: controllo.motivazione,
    p_data_consegna: parsed.data.tipo === "proposta" ? parsed.data.dataConsegna ?? null : null,
    p_righe: parsed.data.righe ?? [],
  });
  if (error) {
    const testo = error.message ?? "";
    if (testo.includes("già una risposta")) return { success: false, error: "Questa versione ha già una risposta." };
    if (testo.includes("versione pubblicata")) {
      return { success: false, error: "Si risponde solo alla versione pubblicata corrente." };
    }
    return { success: false, error: "Risposta non registrata." };
  }
  const corpo = (data ?? {}) as { id?: string; riusata?: boolean; stato?: string };
  await writeAuditLog({
    entity_type: "approvvigionamenti_risposte_fornitore",
    entity_id: String(corpo.id ?? parsed.data.versioneId),
    action: parsed.data.tipo,
    actor_id: accesso.userId,
    summary: "Risposta del fornitore. La versione pubblicata non è stata modificata.",
    payload: { tipo: parsed.data.tipo, riusata: Boolean(corpo.riusata) },
  });
  return { success: true, riusata: Boolean(corpo.riusata), stato: String(corpo.stato ?? "") };
}

export type RispostaInEsame = {
  id: string;
  ordineCodice: string;
  versioneNumero: number;
  tipo: string;
  motivazione: string;
  dataConsegnaProposta: string | null;
  righe: { codice: string; quantita: number; unitaMisura: string }[];
};

export async function listaRisposteProduzioneAction(): Promise<
  { success: true; risposte: RispostaInEsame[] } | Errore
> {
  await requireAreaAccess("produzione");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto || !eUtenteInternoHaccp(soggetto)) {
    return { success: false, error: "Accesso non consentito." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvvigionamenti_risposte_fornitore")
    .select("id, ordine_id, versione_id, tipo, motivazione, data_consegna_proposta, righe")
    .eq("stato", "in_esame")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { success: false, error: "Risposte fornitore non disponibili." };
  const ordineIds = [...new Set((data ?? []).map((row) => String(row.ordine_id)))];
  const versioneIds = [...new Set((data ?? []).map((row) => String(row.versione_id)))];
  const [{ data: ordini }, { data: versioni }] = await Promise.all([
    ordineIds.length
      ? supabase.from("approvvigionamenti_ordini").select("id, codice").in("id", ordineIds)
      : Promise.resolve({ data: [] }),
    versioneIds.length
      ? supabase.from("approvvigionamenti_versioni").select("id, numero").in("id", versioneIds)
      : Promise.resolve({ data: [] }),
  ]);
  const codici = new Map((ordini ?? []).map((row) => [String(row.id), String(row.codice)]));
  const numeri = new Map((versioni ?? []).map((row) => [String(row.id), Number(row.numero)]));
  return {
    success: true,
    risposte: (data ?? []).map((row) => ({
      id: String(row.id),
      ordineCodice: codici.get(String(row.ordine_id)) ?? "",
      versioneNumero: numeri.get(String(row.versione_id)) ?? 0,
      tipo: String(row.tipo),
      motivazione: String(row.motivazione),
      dataConsegnaProposta: row.data_consegna_proposta ? String(row.data_consegna_proposta) : null,
      righe: (Array.isArray(row.righe) ? row.righe : []).map((voce) => {
        const riga = voce as { codice?: string; quantita?: number; unitaMisura?: string };
        return {
          codice: String(riga.codice ?? ""),
          quantita: Number(riga.quantita ?? 0),
          unitaMisura: String(riga.unitaMisura ?? ""),
        };
      }),
    })),
  };
}

export async function decidiRispostaFornitoreAction(raw: unknown): Promise<
  { success: true; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      chiave: z.string().trim().min(8).max(80),
      rispostaId: uuidSchema,
      esito: z.enum(["accettata", "respinta"]),
      nota: z.string().trim().min(3).max(500),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Decisione non valida." };
  const { auth } = await requireAreaAccess("produzione");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto || !eUtenteInternoHaccp(soggetto)) {
    return { success: false, error: "Accesso non consentito." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decidi_risposta_fornitore_approvvigionamento", {
    p_chiave: parsed.data.chiave,
    p_risposta_id: parsed.data.rispostaId,
    p_esito: parsed.data.esito,
    p_nota: parsed.data.nota,
  });
  if (error) return { success: false, error: "Decisione non registrata." };
  const corpo = (data ?? {}) as { riusata?: boolean };
  await writeAuditLog({
    entity_type: "approvvigionamenti_risposte_fornitore",
    entity_id: parsed.data.rispostaId,
    action: parsed.data.esito,
    actor_id: auth.userId,
    summary:
      parsed.data.esito === "accettata"
        ? "Proposta accettata. La nuova versione si pubblica dal calendario, non da questa decisione."
        : "Proposta respinta. La versione pubblicata resta quella corrente.",
    payload: { nota: parsed.data.nota, riusata: Boolean(corpo.riusata) },
  });
  return { success: true, riusata: Boolean(corpo.riusata) };
}
