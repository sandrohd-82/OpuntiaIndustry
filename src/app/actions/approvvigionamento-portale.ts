"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { eUtenteInternoHaccp } from "@/lib/produzione/fornitore-accesso";
import { soggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso-server";
import { validaRispostaFornitore } from "@/lib/produzione/risposta-fornitore";
import {
  aggiungiConsegnaPianoAction,
  aggiornaApprovvigionamentoAction,
  annullaConsegnaApprovvigionamentoAction,
  estendiPeriodoPianoAction,
} from "@/app/actions/approvvigionamento";
import {
  bozzaDopoProposta,
  chiaveEstensioneRisposta,
  chiaveRevisioneRisposta,
  chiaveVoceRevisione,
  materiaIdVoce,
  riepilogoVociAccettate,
  rigaPianoAggiornata,
  statoAccordoFornitore,
  statoRispostaAccordo,
  tipoRispostaAccordo,
  type DifferenzaRevisione,
  type RigaBozzaRevisione,
  type StatoAccordoFornitore,
} from "@/lib/produzione/revisione-da-proposta";
import {
  costruisciRevisionePiano,
  decidiVoceRevisione,
  type BozzaConsegna,
  type ConsegnaUfficiale,
  type PropostaRevisione,
  type VoceRevisione,
} from "@/lib/produzione/revisione-piano";
import { risolviAccessoMaterialeIngresso } from "@/lib/produzione/fornitore-accesso";
import {
  etichettaVersionePortale,
  ruoloVersionePortale,
  type RuoloVersionePortale,
} from "@/lib/produzione/approvvigionamento";
import { normalizzaUnitaApprovvigionamento } from "@/lib/produzione/unita-approvvigionamento";
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
    materiaPrimaId: string;
    codice: string;
    nome: string;
    quantita: number;
    unitaMisura: string;
    tipoQuantita: "precisa" | "stimata";
    note: string;
  }[];
  confermataAt: string | null;
  confermataDa: string | null;
  ruolo: RuoloVersionePortale;
  etichetta: string;
  bozzaNonPubblicata: boolean;
  copertaDalPiano: boolean;
  annullata: boolean;
  accordo: StatoAccordoFornitore | null;
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
  pianoId: string;
  numero: number;
  codice: string;
  tipologia: "settimanale" | "mensile" | "regolare" | "personalizzata" | "giorni_fissi";
  periodoInizio: string;
  periodoFine: string;
  ordini: {
    ordineId: string;
    versioneId: string;
    numero: number;
    codice: string;
    dataConsegna: string;
    annullata: boolean;
  }[];
  confermataAt: string | null;
  ruolo: RuoloVersionePortale;
  etichetta: string;
  bozzaNonPubblicata: boolean;
};

function tipologiaVersionePortale(
  valore: unknown
): PianoRicevuto["tipologia"] {
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
  { success: true; fornitore: string; ordini: VersioneRicevuta[]; piani: PianoRicevuto[] } | Errore
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
  const idsOrdinePortale = [...new Set((versioni ?? []).map((riga) => String(riga.ordine_id)))];
  const idsPianoPortale = [...new Set((piani ?? []).map((riga) => String(riga.piano_id)))];
  const [{ data: ordiniProva }, { data: pianiProva }] = await Promise.all([
    idsOrdinePortale.length
      ? supabase.from("approvvigionamenti_ordini").select("id").in("id", idsOrdinePortale).eq("prova", true)
      : Promise.resolve({ data: [] as { id: string }[] }),
    idsPianoPortale.length
      ? supabase.from("approvvigionamenti_piani").select("id").in("id", idsPianoPortale).eq("prova", true)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  const esclusiOrdini = new Set((ordiniProva ?? []).map((riga) => String(riga.id)));
  const esclusiPiani = new Set((pianiProva ?? []).map((riga) => String(riga.id)));
  const versioniUfficiali = (versioni ?? []).filter((riga) => !esclusiOrdini.has(String(riga.ordine_id)));
  const pianiUfficiali = (piani ?? []).filter((riga) => !esclusiPiani.has(String(riga.piano_id)));
  const { data: segnali, error: erroreSegnali } = await supabase.rpc(
    "approvvigionamenti_segnali_portale"
  );
  if (erroreSegnali) return { success: false, error: "Ordini ricevuti non disponibili." };
  const segnaleOrdine = new Map<string, { numero: number; bozza: boolean; annullata: boolean }>();
  const segnalePiano = new Map<string, { numero: number; bozza: boolean; annullata: boolean }>();
  for (const row of segnali ?? []) {
    const voce = row as {
      ambito?: string;
      riferimento_id?: string;
      versione_pubblicata?: number;
      bozza_non_pubblicata?: boolean;
      annullata?: boolean;
    };
    const destinazione = voce.ambito === "piano" ? segnalePiano : segnaleOrdine;
    destinazione.set(String(voce.riferimento_id), {
      numero: Number(voce.versione_pubblicata),
      bozza: Boolean(voce.bozza_non_pubblicata),
      annullata: Boolean(voce.annullata),
    });
  }
  const { data: anagrafica } = await supabase
    .from("fornitori")
    .select("ragione_sociale")
    .eq("id", accesso.fornitoreId)
    .maybeSingle();
  const versioneIds = versioniUfficiali.map((row) => String(row.id));
  const pianoIds = pianiUfficiali.map((row) => String(row.id));
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
  const ordineDiVersione = new Map(
    versioniUfficiali.map((row) => [String(row.id), String(row.ordine_id)])
  );
  const nomeFornitore = String(anagrafica?.ragione_sociale ?? "Fornitore");
  return {
    success: true,
    fornitore: nomeFornitore,
    ordini: versioniUfficiali.map((row) => {
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
            materiaPrimaId?: string;
            codice?: string;
            nome?: string;
            quantita?: number;
            unitaMisura?: string;
            tipoQuantita?: string;
            note?: string;
          };
          return {
            materiaPrimaId: String(voce.materiaPrimaId ?? ""),
            codice: String(voce.codice ?? ""),
            nome: String(voce.nome ?? ""),
            quantita: Number(voce.quantita ?? 0),
            unitaMisura: String(voce.unitaMisura ?? ""),
            tipoQuantita: voce.tipoQuantita === "stimata" ? "stimata" : "precisa",
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
        annullata: Boolean(segnaleOrdine.get(String(row.ordine_id))?.annullata),
        accordo: (() => {
          const ruolo = ruoloVersionePortale(
            Number(row.numero),
            segnaleOrdine.get(String(row.ordine_id))?.numero ?? null
          );
          if (ruolo !== "corrente") return null;
          const risposta = rispostaPerVersione.get(String(row.id));
          const confermaPrecedente = (risposte ?? []).some((altra) => {
            if (String(altra.versione_id) === String(row.id)) return false;
            if (altra.tipo !== "conferma" || altra.stato !== "accettata") return false;
            return ordineDiVersione.get(String(altra.versione_id)) === String(row.ordine_id);
          });
          return statoAccordoFornitore({
            pubblicato: true,
            annullata: Boolean(segnaleOrdine.get(String(row.ordine_id))?.annullata),
            bozzaNonPubblicata: Boolean(segnaleOrdine.get(String(row.ordine_id))?.bozza),
            rispostaTipo: tipoRispostaAccordo(risposta ? String(risposta.tipo) : null),
            rispostaStato: statoRispostaAccordo(risposta ? String(risposta.stato) : null),
            confermaSuVersionePrecedente: confermaPrecedente,
          });
        })(),
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
    piani: pianiUfficiali.map((row) => {
      const ordini = Array.isArray(row.ordini) ? row.ordini : [];
      return {
        id: String(row.id),
        pianoId: String(row.piano_id),
        numero: Number(row.numero),
        codice: String(row.codice),
        tipologia: tipologiaVersionePortale(row.tipologia),
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
            annullata: Boolean(segnaleOrdine.get(String(riga.ordineId ?? ""))?.annullata),
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

const consegnaUfficialeSchema = z.object({
  id: z.string().uuid(),
  codice: z.string().trim().max(40),
  materiaId: z.string().uuid(),
  materia: z.string().trim().max(200),
  unita: z.string().trim().max(16),
  unitaCatalogo: z.string().trim().max(16).nullable(),
  tipoQuantita: z.enum(["precisa", "stimata"]),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantita: z.number().positive().max(1_000_000),
});

const bozzaConsegnaSchema = consegnaUfficialeSchema.omit({ id: true }).extend({
  consegnaId: z.string().uuid().nullable(),
  elimina: z.boolean(),
});

export async function registraPropostaPianoAction(raw: unknown): Promise<
  { success: true; id: string; riusata: boolean; proposta: PropostaRevisione } | Errore
> {
  const parsed = z
    .object({
      chiave: z.string().trim().min(8).max(80),
      pianoId: uuidSchema,
      versioneId: uuidSchema.nullable(),
      codice: z.string().trim().min(1).max(40),
      motivazione: z.string().trim().max(500),
      ufficiali: z.array(consegnaUfficialeSchema).max(200),
      bozza: z.array(bozzaConsegnaSchema).max(200),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Revisione non valida." };
  const costruita = costruisciRevisionePiano({
    ufficiali: parsed.data.ufficiali as ConsegnaUfficiale[],
    bozza: parsed.data.bozza as BozzaConsegna[],
    motivazione: parsed.data.motivazione,
  });
  if (!costruita.ok) return { success: false, error: costruita.motivo };
  const accesso = await fornitorePortale();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registra_proposta_piano", {
    p_chiave: parsed.data.chiave,
    p_piano_id: parsed.data.pianoId,
    p_versione_id: parsed.data.versioneId,
    p_codice: parsed.data.codice,
    p_motivazione: costruita.motivazione,
    p_voci: costruita.voci,
  });
  if (error) return { success: false, error: "Revisione non registrata." };
  const corpo = (data ?? {}) as { id?: string; riusata?: boolean };
  const id = String(corpo.id ?? "");
  if (!id) return { success: false, error: "Revisione non registrata." };
  await writeAuditLog({
    entity_type: "approvvigionamenti_proposte_piano",
    entity_id: id,
    action: "proposta",
    actor_id: accesso.userId,
    summary: "Revisione della pianificazione registrata. Gli ordini ufficiali non sono stati modificati.",
    payload: { riusata: Boolean(corpo.riusata), voci: costruita.voci.length },
  });
  return {
    success: true,
    id,
    riusata: Boolean(corpo.riusata),
    proposta: {
      id,
      pianoId: parsed.data.pianoId,
      codice: parsed.data.codice,
      motivazione: costruita.motivazione,
      voci: costruita.voci,
    },
  };
}

export async function listaPropostePianoAction(pianoId: string): Promise<
  { success: true; proposte: PropostaRevisione[] } | Errore
> {
  if (!z.string().uuid().safeParse(pianoId).success) {
    return { success: false, error: "Piano non valido." };
  }
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvvigionamenti_proposte_piano")
    .select("id, piano_id, codice, motivazione, voci")
    .eq("piano_id", pianoId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: "Revisioni non disponibili." };
  return {
    success: true,
    proposte: (data ?? []).map((row) => ({
      id: String(row.id),
      pianoId: String(row.piano_id),
      codice: String(row.codice),
      motivazione: String(row.motivazione),
      voci: Array.isArray(row.voci) ? (row.voci as PropostaRevisione["voci"]) : [],
    })),
  };
}

export async function decidiVocePropostaPianoAction(raw: unknown): Promise<
  { success: true; riusata: boolean; proposta: PropostaRevisione } | Errore
> {
  const parsed = z
    .object({
      propostaId: uuidSchema,
      voceId: uuidSchema,
      esito: z.enum(["accettata", "respinta"]),
      nota: z.string().trim().min(3).max(500),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Decisione non valida." };
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvvigionamenti_proposte_piano")
    .select("id, piano_id, codice, motivazione, voci")
    .eq("id", parsed.data.propostaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { success: false, error: "Revisione non trovata." };
  const attuale: PropostaRevisione = {
    id: String(data.id),
    pianoId: String(data.piano_id),
    codice: String(data.codice),
    motivazione: String(data.motivazione),
    voci: Array.isArray(data.voci) ? (data.voci as PropostaRevisione["voci"]) : [],
  };
  const decisa = decidiVoceRevisione(attuale, parsed.data.voceId, parsed.data.esito, parsed.data.nota);
  if (!decisa.ok) return { success: false, error: decisa.motivo };
  if (!decisa.riusata) {
    const salvata = await supabase.rpc("salva_voci_proposta_piano", {
      p_proposta_id: parsed.data.propostaId,
      p_voci: decisa.proposta.voci,
    });
    if (salvata.error) return { success: false, error: "Decisione non registrata." };
    await writeAuditLog({
      entity_type: "approvvigionamenti_proposte_piano",
      entity_id: parsed.data.propostaId,
      action: parsed.data.esito,
      actor_id: auth.userId,
      summary: "Esito su una modifica della pianificazione. Gli ordini ufficiali non sono stati modificati.",
      payload: { voceId: parsed.data.voceId, nota: parsed.data.nota },
    });
  }
  return { success: true, riusata: decisa.riusata, proposta: decisa.proposta };
}

type ClientApprovvigionamento = Awaited<ReturnType<typeof createClient>>;

type ContestoBozza = {
  id: string;
  codice: string;
  fornitoreId: string;
  dataConsegna: string;
  note: string;
  revisione: number;
  versionePubblicata: number | null;
  versioneCorrenteId: string | null;
  presaVisioneAt: string | null;
  foglioIngressoId: string | null;
  righe: RigaBozzaRevisione[];
  carichi: number;
  piano: { id: string; inizio: string; fine: string; revisione: number; versioneId: string | null } | null;
};

export type AnteprimaRevisione = {
  differenze: DifferenzaRevisione[];
  applicabile: boolean;
  motivo: string | null;
  giaApplicata: boolean;
  revisione: number;
  pianoRevisione: number | null;
  revisioni: { ordineId: string; revisione: number }[];
};

function giornoBreve(valore: unknown): string {
  return String(valore ?? "").slice(0, 10);
}

function righeProposta(raw: unknown): { codice: string; quantita: number; unitaMisura: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((voce) => {
    const riga = voce as { codice?: string; quantita?: number; unitaMisura?: string };
    return {
      codice: String(riga.codice ?? ""),
      quantita: Number(riga.quantita ?? 0),
      unitaMisura: String(riga.unitaMisura ?? ""),
    };
  });
}

function righePayload(righe: readonly RigaBozzaRevisione[]) {
  return righe.map((riga) => ({
    materiaPrimaId: riga.materiaPrimaId,
    quantita: riga.quantita,
    unitaMisura: riga.unitaMisura,
    unitaNome: riga.unitaNome,
    tipoQuantita: riga.tipoQuantita,
    note: riga.note,
  }));
}

function giaUsata(errore: string): boolean {
  return errore.includes("già stata usata");
}

function bloccoBozza(bozza: ContestoBozza): string | null {
  if (bozza.presaVisioneAt || bozza.foglioIngressoId) {
    return "La bozza non si aggiorna perché risulta già collegata a una presa visione o a un foglio di ingresso. La versione pubblicata resta invariata.";
  }
  if (bozza.carichi > 0) {
    return "La consegna ha già un carico. La bozza non si modifica e i carichi restano invariati.";
  }
  return null;
}

async function accessoProduzione(): Promise<{ userId: string } | Errore> {
  const { auth } = await requireAreaAccess("produzione");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto || !eUtenteInternoHaccp(soggetto)) {
    return { success: false, error: "Accesso non consentito." };
  }
  return { userId: auth.userId };
}

async function chiaviGiaUsate(
  supabase: ClientApprovvigionamento,
  chiavi: string[]
): Promise<Set<string> | null> {
  if (!chiavi.length) return new Set();
  const { data, error } = await supabase
    .from("approvvigionamenti_operazioni")
    .select("chiave")
    .in("chiave", chiavi);
  if (error) return null;
  return new Set((data ?? []).map((row) => String(row.chiave)));
}

async function materiePerCodice(
  supabase: ClientApprovvigionamento,
  codici: string[]
): Promise<Record<string, string>> {
  const utili = [...new Set(codici.filter(Boolean))];
  if (!utili.length) return {};
  const { data } = await supabase.from("materie_prime").select("id, codice").in("codice", utili);
  const mappa: Record<string, string> = {};
  for (const row of data ?? []) mappa[String(row.codice)] = String(row.id);
  return mappa;
}

async function leggiBozza(
  supabase: ClientApprovvigionamento,
  ordineId: string
): Promise<ContestoBozza | Errore> {
  const { data: ordine, error } = await supabase
    .from("approvvigionamenti_ordini")
    .select(
      "id, codice, fornitore_id, data_consegna, note, revisione, stato, versione_pubblicata, presa_visione_at, foglio_ingresso_id"
    )
    .eq("id", ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !ordine || ordine.stato === "annullato") {
    return { success: false, error: "Consegna non disponibile." };
  }
  const [{ data: righe, error: erroreRighe }, { count, error: erroreCarichi }, { data: collegamenti }] =
    await Promise.all([
      supabase
        .from("approvvigionamenti_righe")
        .select("materia_prima_id, quantita, unita_misura, unita_nome, tipo_quantita, note, sort_order")
        .eq("ordine_id", ordineId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("approvvigionamenti_carichi")
        .select("id", { count: "exact", head: true })
        .eq("ordine_id", ordineId)
        .is("deleted_at", null),
      supabase.from("approvvigionamenti_piani_ordini").select("piano_id").eq("ordine_id", ordineId).limit(1),
    ]);
  if (erroreRighe || erroreCarichi) return { success: false, error: "Dettaglio della bozza non disponibile." };
  const materiaIds = [...new Set((righe ?? []).map((row) => String(row.materia_prima_id)))];
  const { data: materie } = materiaIds.length
    ? await supabase.from("materie_prime").select("id, codice").in("id", materiaIds)
    : { data: [] };
  const codici = new Map((materie ?? []).map((row) => [String(row.id), String(row.codice)]));
  const pianoId = collegamenti?.[0]?.piano_id ? String(collegamenti[0].piano_id) : null;
  const { data: piano } = pianoId
    ? await supabase
        .from("approvvigionamenti_piani")
        .select("id, periodo_inizio, periodo_fine, revisione, versione_pubblicata")
        .eq("id", pianoId)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  let versioneCorrenteId: string | null = null;
  if (ordine.versione_pubblicata != null) {
    const { data: versione } = await supabase
      .from("approvvigionamenti_versioni")
      .select("id")
      .eq("ordine_id", ordineId)
      .eq("numero", ordine.versione_pubblicata)
      .maybeSingle();
    versioneCorrenteId = versione ? String(versione.id) : null;
  }
  let versionePianoId: string | null = null;
  if (piano?.versione_pubblicata != null) {
    const { data: versionePiano } = await supabase
      .from("approvvigionamenti_piani_versioni")
      .select("id")
      .eq("piano_id", piano.id)
      .eq("numero", piano.versione_pubblicata)
      .maybeSingle();
    versionePianoId = versionePiano ? String(versionePiano.id) : null;
  }
  return {
    id: String(ordine.id),
    codice: String(ordine.codice),
    fornitoreId: String(ordine.fornitore_id),
    dataConsegna: giornoBreve(ordine.data_consegna),
    note: String(ordine.note ?? ""),
    revisione: Number(ordine.revisione ?? 1),
    versionePubblicata: ordine.versione_pubblicata == null ? null : Number(ordine.versione_pubblicata),
    versioneCorrenteId,
    presaVisioneAt: ordine.presa_visione_at ? String(ordine.presa_visione_at) : null,
    foglioIngressoId: ordine.foglio_ingresso_id ? String(ordine.foglio_ingresso_id) : null,
    carichi: count ?? 0,
    righe: (righe ?? []).map((row) => ({
      materiaPrimaId: String(row.materia_prima_id),
      codice: codici.get(String(row.materia_prima_id)) ?? "",
      quantita: Number(row.quantita),
      unitaMisura: String(row.unita_misura),
      unitaNome: String(row.unita_nome ?? ""),
      tipoQuantita: row.tipo_quantita === "stimata" ? "stimata" : "precisa",
      note: String(row.note ?? ""),
    })),
    piano: piano
      ? {
          id: String(piano.id),
          inizio: giornoBreve(piano.periodo_inizio),
          fine: giornoBreve(piano.periodo_fine),
          revisione: Number(piano.revisione ?? 1),
          versioneId: versionePianoId,
        }
      : null,
  };
}

async function leggiRevisionePiano(
  supabase: ClientApprovvigionamento,
  pianoId: string
): Promise<number | null> {
  const { data } = await supabase
    .from("approvvigionamenti_piani")
    .select("revisione")
    .eq("id", pianoId)
    .maybeSingle();
  return data ? Number(data.revisione ?? 1) : null;
}

async function allargaPeriodo(input: {
  chiave: string;
  pianoId: string;
  revisione: number;
  data: string;
}): Promise<{ ok: true; revisione: number; inizio: string; fine: string } | Errore> {
  const esteso = await estendiPeriodoPianoAction({
    chiave: input.chiave,
    pianoId: input.pianoId,
    revisione: input.revisione,
    data: input.data,
  });
  if (!esteso.success) return esteso;
  return { ok: true, revisione: esteso.revisione, inizio: "", fine: "" };
}

export type PropostaAccettata = {
  id: string;
  ordineCodice: string;
  versioneNumero: number;
  tipo: string;
  motivazione: string;
  giaApplicata: boolean;
};

export async function listaProposteAccettateAction(): Promise<
  { success: true; proposte: PropostaAccettata[] } | Errore
> {
  const accesso = await accessoProduzione();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvvigionamenti_risposte_fornitore")
    .select("id, ordine_id, versione_id, tipo, motivazione")
    .eq("stato", "accettata")
    .in("tipo", ["proposta", "indisponibilita"])
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return { success: false, error: "Proposte accettate non disponibili." };
  const ordineIds = [...new Set((data ?? []).map((row) => String(row.ordine_id)))];
  const versioneIds = [...new Set((data ?? []).map((row) => String(row.versione_id)))];
  const chiavi = (data ?? []).map((row) => chiaveRevisioneRisposta(String(row.id)));
  const [{ data: ordini }, { data: versioni }, presenti] = await Promise.all([
    ordineIds.length
      ? supabase.from("approvvigionamenti_ordini").select("id, codice").in("id", ordineIds)
      : Promise.resolve({ data: [] }),
    versioneIds.length
      ? supabase.from("approvvigionamenti_versioni").select("id, numero").in("id", versioneIds)
      : Promise.resolve({ data: [] }),
    chiaviGiaUsate(supabase, chiavi),
  ]);
  if (!presenti) return { success: false, error: "Proposte accettate non disponibili." };
  const codici = new Map((ordini ?? []).map((row) => [String(row.id), String(row.codice)]));
  const numeri = new Map((versioni ?? []).map((row) => [String(row.id), Number(row.numero)]));
  return {
    success: true,
    proposte: (data ?? []).map((row) => ({
      id: String(row.id),
      ordineCodice: codici.get(String(row.ordine_id)) ?? "",
      versioneNumero: numeri.get(String(row.versione_id)) ?? 0,
      tipo: String(row.tipo),
      motivazione: String(row.motivazione),
      giaApplicata: presenti.has(chiaveRevisioneRisposta(String(row.id))),
    })),
  };
}

export async function anteprimaRevisioneRispostaAction(
  rispostaId: string
): Promise<({ success: true } & AnteprimaRevisione) | Errore> {
  if (!uuidSchema.safeParse(rispostaId).success) {
    return { success: false, error: "Proposta non valida." };
  }
  const accesso = await accessoProduzione();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const preparata = await preparaRisposta(supabase, rispostaId);
  if ("success" in preparata) return preparata;
  return { success: true, ...preparata.anteprima };
}

export async function applicaRevisioneRispostaAction(raw: unknown): Promise<
  { success: true; giaApplicata: boolean } | Errore
> {
  const parsed = z
    .object({
      rispostaId: uuidSchema,
      revisione: z.number().int().positive(),
      pianoRevisione: z.number().int().positive().nullable(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Revisione non valida." };
  const accesso = await accessoProduzione();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const preparata = await preparaRisposta(supabase, parsed.data.rispostaId);
  if ("success" in preparata) return preparata;
  if (preparata.anteprima.giaApplicata) return { success: true, giaApplicata: true };
  if (!preparata.anteprima.applicabile || !preparata.bozza) {
    return { success: false, error: preparata.anteprima.motivo ?? "Proposta non applicabile." };
  }
  if (preparata.bozza.revisione !== parsed.data.revisione) {
    return { success: false, error: "La bozza è stata modificata da un altro salvataggio. Riapri il riepilogo." };
  }
  const piano = preparata.bozza.piano;
  if (
    piano &&
    preparata.dataConsegna &&
    (preparata.dataConsegna < piano.inizio || preparata.dataConsegna > piano.fine)
  ) {
    if (piano.revisione !== parsed.data.pianoRevisione) {
      return { success: false, error: "La pianificazione è stata modificata da un altro salvataggio. Riapri il riepilogo." };
    }
    const presenti = await chiaviGiaUsate(supabase, [chiaveEstensioneRisposta(parsed.data.rispostaId)]);
    if (!presenti) return { success: false, error: "Revisione non applicata." };
    if (!presenti.has(chiaveEstensioneRisposta(parsed.data.rispostaId))) {
      const esteso = await allargaPeriodo({
        chiave: chiaveEstensioneRisposta(parsed.data.rispostaId),
        pianoId: piano.id,
        revisione: piano.revisione,
        data: preparata.dataConsegna,
      });
      if ("success" in esteso) {
        if (!giaUsata(esteso.error)) return esteso;
      }
    }
  }
  const scritto = await aggiornaApprovvigionamentoAction({
    chiave: chiaveRevisioneRisposta(parsed.data.rispostaId),
    ordineId: preparata.bozza.id,
    revisione: preparata.bozza.revisione,
    ordine: {
      fornitoreId: preparata.bozza.fornitoreId,
      dataConsegna: preparata.dataConsegna,
      note: preparata.bozza.note,
      righe: righePayload(preparata.righe),
    },
  });
  if (!scritto.success) {
    if (giaUsata(scritto.error)) return { success: true, giaApplicata: true };
    return scritto;
  }
  await writeAuditLog({
    entity_type: "approvvigionamenti_risposte_fornitore",
    entity_id: parsed.data.rispostaId,
    action: "aggiorna",
    actor_id: accesso.userId,
    summary: "Proposta accettata copiata sulla bozza. La versione pubblicata non è stata modificata.",
    payload: { riusata: scritto.riusata, ordineId: preparata.bozza.id },
  });
  return { success: true, giaApplicata: scritto.riusata };
}

async function preparaRisposta(
  supabase: ClientApprovvigionamento,
  rispostaId: string
): Promise<
  | {
      anteprima: AnteprimaRevisione;
      bozza: ContestoBozza | null;
      dataConsegna: string;
      righe: RigaBozzaRevisione[];
    }
  | Errore
> {
  const { data: risposta, error } = await supabase
    .from("approvvigionamenti_risposte_fornitore")
    .select("id, ordine_id, versione_id, tipo, stato, data_consegna_proposta, righe")
    .eq("id", rispostaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !risposta) return { success: false, error: "Proposta non trovata." };
  if (risposta.stato !== "accettata" || (risposta.tipo !== "proposta" && risposta.tipo !== "indisponibilita")) {
    return { success: false, error: "Si prepara la revisione solo di una proposta accettata." };
  }
  const bozza = await leggiBozza(supabase, String(risposta.ordine_id));
  if ("success" in bozza) return bozza;
  const presenti = await chiaviGiaUsate(supabase, [chiaveRevisioneRisposta(rispostaId)]);
  if (!presenti) return { success: false, error: "Proposta non disponibile." };
  const giaApplicata = presenti.has(chiaveRevisioneRisposta(rispostaId));
  const vuota: AnteprimaRevisione = {
    differenze: [],
    applicabile: false,
    motivo: null,
    giaApplicata,
    revisione: bozza.revisione,
    pianoRevisione: bozza.piano?.revisione ?? null,
    revisioni: [{ ordineId: bozza.id, revisione: bozza.revisione }],
  };
  if (bozza.versioneCorrenteId !== String(risposta.versione_id)) {
    return {
      anteprima: {
        ...vuota,
        motivo: "La proposta riguarda una versione non più corrente. Non si copia sulla bozza.",
      },
      bozza: null,
      dataConsegna: bozza.dataConsegna,
      righe: [],
    };
  }
  const blocco = bloccoBozza(bozza);
  if (blocco) {
    return { anteprima: { ...vuota, motivo: blocco }, bozza: null, dataConsegna: bozza.dataConsegna, righe: [] };
  }
  const proposte = righeProposta(risposta.righe);
  const mappa = await materiePerCodice(
    supabase,
    proposte.map((riga) => riga.codice)
  );
  const costruita = bozzaDopoProposta({
    dataAttuale: bozza.dataConsegna,
    dataProposta: risposta.data_consegna_proposta ? giornoBreve(risposta.data_consegna_proposta) : null,
    righeAttuali: bozza.righe,
    righeProposte: proposte,
    materiePerCodice: mappa,
  });
  if (!costruita.ok) {
    return {
      anteprima: {
        ...vuota,
        motivo: giaApplicata
          ? "Proposta già applicata alla bozza. Pubblica la nuova versione dal calendario."
          : costruita.motivo,
      },
      bozza: null,
      dataConsegna: bozza.dataConsegna,
      righe: [],
    };
  }
  return {
    anteprima: {
      ...vuota,
      differenze: costruita.differenze,
      applicabile: !giaApplicata,
      motivo: giaApplicata
        ? "Proposta già applicata alla bozza. Pubblica la nuova versione dal calendario."
        : null,
    },
    bozza: giaApplicata ? null : bozza,
    dataConsegna: costruita.dataConsegna,
    righe: costruita.righe,
  };
}

export async function anteprimaRevisionePianoAction(
  propostaId: string
): Promise<({ success: true } & AnteprimaRevisione) | Errore> {
  if (!uuidSchema.safeParse(propostaId).success) return { success: false, error: "Revisione non valida." };
  const accesso = await accessoProduzione();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const preparata = await preparaPiano(supabase, propostaId);
  if ("success" in preparata) return preparata;
  return { success: true, ...preparata.anteprima };
}

export async function applicaRevisionePianoAction(raw: unknown): Promise<
  { success: true; giaApplicata: boolean } | Errore
> {
  const parsed = z
    .object({
      propostaId: uuidSchema,
      pianoRevisione: z.number().int().positive(),
      revisioni: z
        .array(z.object({ ordineId: uuidSchema, revisione: z.number().int().positive() }))
        .max(200),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Revisione non valida." };
  const accesso = await accessoProduzione();
  if ("success" in accesso) return accesso;
  const supabase = await createClient();
  const preparata = await preparaPiano(supabase, parsed.data.propostaId);
  if ("success" in preparata) return preparata;
  if (preparata.anteprima.giaApplicata) return { success: true, giaApplicata: true };
  if (!preparata.anteprima.applicabile) {
    return { success: false, error: preparata.anteprima.motivo ?? "Revisione non applicabile." };
  }
  if (preparata.pianoRevisione !== parsed.data.pianoRevisione) {
    return {
      success: false,
      error: "La pianificazione è stata modificata da un altro salvataggio. Riapri il riepilogo.",
    };
  }
  const attese = new Map(parsed.data.revisioni.map((voce) => [voce.ordineId, voce.revisione]));
  for (const [ordineId, revisione] of preparata.revisioni) {
    if (attese.get(ordineId) !== revisione) {
      return { success: false, error: "La bozza è stata modificata da un altro salvataggio. Riapri il riepilogo." };
    }
  }
  let revisionePiano = preparata.pianoRevisione;
  const revisioneOrdine = new Map(preparata.revisioni);
  for (const passo of preparata.passi) {
    if (passo.tipo === "aggiungi") {
      const aggiunto = await aggiungiConsegnaPianoAction({
        chiave: passo.chiave,
        pianoId: preparata.pianoId,
        revisione: revisionePiano,
        data: passo.data,
        note: "Da revisione accettata",
        righe: [passo.riga],
      });
      if (!aggiunto.success) {
        if (giaUsata(aggiunto.error)) {
          const riletta = await leggiRevisionePiano(supabase, preparata.pianoId);
          if (riletta != null) revisionePiano = riletta;
          continue;
        }
        return {
          success: false,
          error: `Applicazione interrotta: ${aggiunto.error} Le modifiche già scritte restano sulla bozza e non vengono ripetute.`,
        };
      }
      revisionePiano = aggiunto.revisione;
      continue;
    }
    const revisione = revisioneOrdine.get(passo.ordineId);
    if (!revisione) {
      return { success: false, error: "Consegna non disponibile. Riapri il riepilogo." };
    }
    if (passo.tipo === "estendi") {
      const esteso = await allargaPeriodo({
        chiave: passo.chiave,
        pianoId: preparata.pianoId,
        revisione: revisionePiano,
        data: passo.data,
      });
      if ("success" in esteso) {
        if (!giaUsata(esteso.error)) return esteso;
      } else {
        revisionePiano = esteso.revisione;
      }
      const dopoEstensione = await leggiRevisionePiano(supabase, preparata.pianoId);
      if (dopoEstensione != null) revisionePiano = dopoEstensione;
      continue;
    }
    if (passo.tipo === "annulla") {
      const annullato = await annullaConsegnaApprovvigionamentoAction({
        chiave: passo.chiave,
        ordineId: passo.ordineId,
        revisione,
      });
      if (!annullato.success) {
        if (giaUsata(annullato.error)) continue;
        return {
          success: false,
          error: `Applicazione interrotta: ${annullato.error} Le modifiche già scritte restano sulla bozza e non vengono ripetute.`,
        };
      }
      const dopoAnnullamento = await leggiRevisionePiano(supabase, preparata.pianoId);
      if (dopoAnnullamento != null) revisionePiano = dopoAnnullamento;
      continue;
    }
    const scritto = await aggiornaApprovvigionamentoAction({
      chiave: passo.chiave,
      ordineId: passo.ordineId,
      revisione,
      ordine: passo.ordine,
    });
    if (!scritto.success) {
      if (giaUsata(scritto.error)) continue;
      return {
        success: false,
        error: `Applicazione interrotta: ${scritto.error} Le modifiche già scritte restano sulla bozza e non vengono ripetute.`,
      };
    }
    revisioneOrdine.set(passo.ordineId, scritto.revisione);
    const dopoAggiornamento = await leggiRevisionePiano(supabase, preparata.pianoId);
    if (dopoAggiornamento != null) revisionePiano = dopoAggiornamento;
  }
  await writeAuditLog({
    entity_type: "approvvigionamenti_proposte_piano",
    entity_id: parsed.data.propostaId,
    action: "aggiorna",
    actor_id: accesso.userId,
    summary: "Modifiche accettate copiate sulla bozza del piano. La versione pubblicata non è stata modificata.",
    payload: { passi: preparata.passi.length },
  });
  return { success: true, giaApplicata: false };
}

type PassoRevisione =
  | { tipo: "estendi"; chiave: string; ordineId: string; data: string }
  | { tipo: "annulla"; chiave: string; ordineId: string }
  | {
      tipo: "aggiorna";
      chiave: string;
      ordineId: string;
      ordine: {
        fornitoreId: string;
        dataConsegna: string;
        note: string;
        righe: ReturnType<typeof righePayload>;
      };
    }
  | {
      tipo: "aggiungi";
      chiave: string;
      ordineId: string;
      data: string;
      riga: ReturnType<typeof righePayload>[number];
    };

async function preparaPiano(
  supabase: ClientApprovvigionamento,
  propostaId: string
): Promise<
  | {
      anteprima: AnteprimaRevisione;
      pianoId: string;
      pianoRevisione: number;
      revisioni: Map<string, number>;
      ordiniIds: string[];
      passi: PassoRevisione[];
    }
  | Errore
> {
  const { data, error } = await supabase
    .from("approvvigionamenti_proposte_piano")
    .select("id, piano_id, versione_piano_id, motivazione, voci")
    .eq("id", propostaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { success: false, error: "Revisione non trovata." };
  const voci = (Array.isArray(data.voci) ? data.voci : []) as VoceRevisione[];
  const riepilogo = riepilogoVociAccettate(voci);
  const { data: piano, error: errorePiano } = await supabase
    .from("approvvigionamenti_piani")
    .select("id, revisione, versione_pubblicata, periodo_inizio, periodo_fine")
    .eq("id", data.piano_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (errorePiano || !piano) return { success: false, error: "Piano non disponibile." };
  let versioneCorrente: string | null = null;
  if (piano.versione_pubblicata != null) {
    const { data: versione } = await supabase
      .from("approvvigionamenti_piani_versioni")
      .select("id")
      .eq("piano_id", piano.id)
      .eq("numero", piano.versione_pubblicata)
      .maybeSingle();
    versioneCorrente = versione ? String(versione.id) : null;
  }
  const accettate = voci.filter((voce) => voce.stato === "accettata");
  const chiavi = accettate.flatMap((voce) => [
    chiaveVoceRevisione(voce.id, "aggiorna"),
    chiaveVoceRevisione(voce.id, "annulla"),
    chiaveVoceRevisione(voce.id, "aggiungi"),
    chiaveVoceRevisione(voce.id, "estendi"),
  ]);
  const presenti = await chiaviGiaUsate(supabase, chiavi);
  if (!presenti) return { success: false, error: "Revisione non disponibile." };
  const vuota: AnteprimaRevisione = {
    differenze: riepilogo.differenze,
    applicabile: false,
    motivo: riepilogo.motivo,
    giaApplicata: false,
    revisione: Number(piano.revisione ?? 1),
    pianoRevisione: Number(piano.revisione ?? 1),
    revisioni: [],
  };
  if (data.versione_piano_id && versioneCorrente && String(data.versione_piano_id) !== versioneCorrente) {
    return {
      anteprima: {
        ...vuota,
        motivo: "La revisione riguarda una versione del piano non più corrente. Non si copia sulla bozza.",
      },
      pianoId: String(piano.id),
      pianoRevisione: Number(piano.revisione ?? 1),
      revisioni: new Map(),
      ordiniIds: [],
      passi: [],
    };
  }
  if (!riepilogo.applicabile) {
    return {
      anteprima: vuota,
      pianoId: String(piano.id),
      pianoRevisione: Number(piano.revisione ?? 1),
      revisioni: new Map(),
      ordiniIds: [],
      passi: [],
    };
  }
  const passi: PassoRevisione[] = [];
  const revisioni = new Map<string, number>();
  const bozze = new Map<string, ContestoBozza>();
  const codici = accettate
    .filter((voce) => voce.operazione === "aggiunta" && !materiaIdVoce(voce))
    .map((voce) => voce.codice);
  const materie = await materiePerCodice(supabase, codici);
  for (const voce of accettate) {
    if (voce.operazione === "aggiunta") {
      if (presenti.has(chiaveVoceRevisione(voce.id, "aggiungi"))) continue;
      const materiaPrimaId = materiaIdVoce(voce) ?? materie[voce.codice] ?? "";
      const unita = normalizzaUnitaApprovvigionamento(voce.unita);
      if (!unita.ok || !voce.dataDopo || !(Number(voce.quantitaDopo) > 0) || !uuidSchema.safeParse(materiaPrimaId).success) {
        return {
          anteprima: {
            ...vuota,
            motivo: unita.ok
              ? `La consegna aggiunta ${voce.codice} non ha una materia applicabile. Aggiungila dal calendario.`
              : "Unità proposta non prevista.",
          },
          pianoId: String(piano.id),
          pianoRevisione: Number(piano.revisione ?? 1),
          revisioni,
          ordiniIds: [...bozze.keys()],
          passi: [],
        };
      }
      passi.push({
        tipo: "aggiungi",
        chiave: chiaveVoceRevisione(voce.id, "aggiungi"),
        ordineId: String(piano.id),
        data: voce.dataDopo,
        riga: {
          materiaPrimaId,
          quantita: Number(voce.quantitaDopo),
          unitaMisura: unita.sigla,
          unitaNome: "",
          tipoQuantita: voce.tipoQuantita === "stimata" ? "stimata" : "precisa",
          note: "",
        },
      });
      continue;
    }
    if (!voce.consegnaId) {
      return {
        anteprima: { ...vuota, motivo: "Una modifica accettata non indica la consegna." },
        pianoId: String(piano.id),
        pianoRevisione: Number(piano.revisione ?? 1),
        revisioni,
        ordiniIds: [],
        passi: [],
      };
    }
    const chiave =
      voce.operazione === "eliminazione"
        ? chiaveVoceRevisione(voce.id, "annulla")
        : chiaveVoceRevisione(voce.id, "aggiorna");
    if (presenti.has(chiave)) continue;
    let bozza = bozze.get(voce.consegnaId);
    if (!bozza) {
      const letta = await leggiBozza(supabase, voce.consegnaId);
      if ("success" in letta) return letta;
      bozza = letta;
      bozze.set(voce.consegnaId, letta);
      revisioni.set(letta.id, letta.revisione);
    }
    const blocco = bloccoBozza(bozza);
    if (blocco) {
      return {
        anteprima: { ...vuota, motivo: blocco },
        pianoId: String(piano.id),
        pianoRevisione: Number(piano.revisione ?? 1),
        revisioni,
        ordiniIds: [...bozze.keys()],
        passi: [],
      };
    }
    if (voce.operazione === "eliminazione") {
      passi.push({ tipo: "annulla", chiave, ordineId: bozza.id });
      continue;
    }
    const aggiornata = rigaPianoAggiornata({
      dataAttuale: bozza.dataConsegna,
      righe: bozza.righe,
      voce,
    });
    if (!aggiornata.ok) {
      return {
        anteprima: { ...vuota, motivo: aggiornata.motivo },
        pianoId: String(piano.id),
        pianoRevisione: Number(piano.revisione ?? 1),
        revisioni,
        ordiniIds: [...bozze.keys()],
        passi: [],
      };
    }
    if (
      bozza.piano &&
      (aggiornata.dataConsegna < bozza.piano.inizio || aggiornata.dataConsegna > bozza.piano.fine) &&
      !presenti.has(chiaveVoceRevisione(voce.id, "estendi"))
    ) {
      passi.push({
        tipo: "estendi",
        chiave: chiaveVoceRevisione(voce.id, "estendi"),
        ordineId: bozza.id,
        data: aggiornata.dataConsegna,
      });
    }
    bozza.righe = aggiornata.righe;
    bozza.dataConsegna = aggiornata.dataConsegna;
    passi.push({
      tipo: "aggiorna",
      chiave,
      ordineId: bozza.id,
      ordine: {
        fornitoreId: bozza.fornitoreId,
        dataConsegna: aggiornata.dataConsegna,
        note: bozza.note,
        righe: righePayload(aggiornata.righe),
      },
    });
  }
  const rimaste = passi.filter((passo) => passo.tipo !== "estendi");
  const giaApplicata = rimaste.length === 0;
  return {
    anteprima: {
      differenze: riepilogo.differenze,
      applicabile: !giaApplicata,
      motivo: giaApplicata
        ? "Revisione già applicata alla bozza. Pubblica la nuova versione dal calendario."
        : presenti.size > 0
          ? "Alcune modifiche sono già sulla bozza e non vengono ripetute."
          : null,
      giaApplicata,
      revisione: [...revisioni.values()][0] ?? Number(piano.revisione ?? 1),
      pianoRevisione: Number(piano.revisione ?? 1),
      revisioni: [...revisioni.entries()].map(([ordineId, revisione]) => ({ ordineId, revisione })),
    },
    pianoId: String(piano.id),
    pianoRevisione: Number(piano.revisione ?? 1),
    revisioni,
    ordiniIds: [...bozze.keys()],
    passi: giaApplicata ? [] : passi,
  };
}
