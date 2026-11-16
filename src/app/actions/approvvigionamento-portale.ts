"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { soggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso-server";
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
