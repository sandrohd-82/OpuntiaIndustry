import { inviaDaCasellaAnagrafica } from "@/lib/anagrafica/casella-invio";
import {
  pdfPianificazione,
  xlsxPianificazione,
  type DocumentoPianificazione,
} from "@/lib/produzione/documento-pianificazione";
import { createClient } from "@/lib/supabase/server";
import {
  allegatiConfermati,
  chiaveInvioConfermato,
  concludiTentativoInvio,
  documentoDalleRigheSalvate,
  testoConRiferimento,
  type EsitoInvioConfermato,
} from "@/lib/produzione/invio-conferma";

type Client = Awaited<ReturnType<typeof createClient>>;

function comeOggetto(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return (data[0] ?? {}) as Record<string, unknown>;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return {};
}

function documentoDaSnapshot(valore: unknown): DocumentoPianificazione | null {
  if (!valore || typeof valore !== "object") return null;
  const riga = valore as DocumentoPianificazione;
  if (!Array.isArray(riga.consegne) || typeof riga.codice !== "string") return null;
  return riga;
}

async function documentoConfermato(
  supabase: Client,
  ordineIds: string[],
  pianoId: string | null
): Promise<{
  documento: DocumentoPianificazione;
  revisione: number;
  ordineId: string | null;
  pianoId: string | null;
}> {
  let ids = ordineIds;
  let codice = "";
  let periodoInizio = "";
  let periodoFine = "";
  let revisione = 1;
  let fornitoreId = "";
  if (pianoId) {
    const { data: piano, error } = await supabase
      .from("approvvigionamenti_piani")
      .select("id, codice, fornitore_id, periodo_inizio, periodo_fine, revisione")
      .eq("id", pianoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !piano) throw new Error("Pianificazione salvata non trovata.");
    const { data: collegamenti, error: erroreLink } = await supabase
      .from("approvvigionamenti_piani_ordini")
      .select("ordine_id")
      .eq("piano_id", pianoId);
    if (erroreLink) throw new Error("Consegne salvate non disponibili.");
    ids = (collegamenti ?? []).map((riga) => String(riga.ordine_id));
    codice = String(piano.codice);
    periodoInizio = String(piano.periodo_inizio);
    periodoFine = String(piano.periodo_fine);
    revisione = Number(piano.revisione ?? 1);
    fornitoreId = String(piano.fornitore_id);
  }
  if (!ids.length) throw new Error("Nessuna consegna salvata da allegare.");
  const { data: ordini, error } = await supabase
    .from("approvvigionamenti_ordini")
    .select("id, codice, fornitore_id, data_consegna, note, stato, revisione")
    .in("id", ids)
    .is("deleted_at", null);
  if (error || !ordini?.length) throw new Error("Ordine salvato non trovato.");
  if (!pianoId) {
    const date = ordini.map((ordine) => String(ordine.data_consegna)).sort();
    codice = String(ordini[0]?.codice ?? "");
    periodoInizio = date[0] ?? "";
    periodoFine = date[date.length - 1] ?? periodoInizio;
    revisione = Number(ordini[0]?.revisione ?? 1);
    fornitoreId = String(ordini[0]?.fornitore_id ?? "");
  }
  const { data: righe, error: erroreRighe } = await supabase
    .from("approvvigionamenti_righe")
    .select("ordine_id, materia_prima_id, quantita, unita_misura, unita_nome, tipo_quantita, sort_order")
    .in("ordine_id", ids)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (erroreRighe) throw new Error("Righe salvate non disponibili.");
  const materiaIds = [...new Set((righe ?? []).map((riga) => String(riga.materia_prima_id)))];
  const [{ data: materie }, { data: fornitore }] = await Promise.all([
    materiaIds.length
      ? supabase.from("materie_prime").select("id, nome").in("id", materiaIds)
      : Promise.resolve({ data: [] }),
    fornitoreId
      ? supabase.from("fornitori").select("ragione_sociale").eq("id", fornitoreId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const nomi = new Map((materie ?? []).map((riga) => [String(riga.id), String(riga.nome)]));
  const perOrdine = new Map(ordini.map((ordine) => [String(ordine.id), ordine]));
  const note = [...new Set(ordini.map((ordine) => String(ordine.note ?? "")))];
  const consegne = (righe ?? [])
    .map((riga) => {
      const ordine = perOrdine.get(String(riga.ordine_id));
      if (!ordine) return null;
      const nomeUnita = String(riga.unita_nome ?? "").trim();
      return {
        data: String(ordine.data_consegna),
        materia: nomi.get(String(riga.materia_prima_id)) ?? "",
        unita: nomeUnita || String(riga.unita_misura ?? ""),
        quantita: Number(riga.quantita),
        tipoQuantita: riga.tipo_quantita === "stimata" ? "stimata" as const : "precisa" as const,
        stato: String(ordine.stato ?? "bozza"),
      };
    })
    .filter((riga): riga is NonNullable<typeof riga> => riga !== null)
    .sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        a.materia.localeCompare(b.materia) ||
        a.quantita - b.quantita ||
        a.unita.localeCompare(b.unita)
    );
  return {
    documento: documentoDalleRigheSalvate({
      codice,
      fornitore: String(fornitore?.ragione_sociale ?? ""),
      note: note.length === 1 ? note[0] : "",
      periodoInizio,
      periodoFine,
      consegne,
    }),
    revisione,
    ordineId: pianoId ? null : String(ordini[0]?.id ?? ""),
    pianoId,
  };
}

/** Salva la richiesta e tenta l'SMTP solo dopo. Non pubblica e non copia in webmail. */
export async function accodaEInviaConfermato(input: {
  supabase: Client;
  chiaveSalvataggio: string;
  ordineIds: string[];
  pianoId: string | null;
  destinatario: string;
  oggetto: string;
  testo: string;
  pdf: boolean;
  xlsx: boolean;
  confermaIncerta: boolean;
}): Promise<EsitoInvioConfermato> {
  const confermato = await documentoConfermato(input.supabase, input.ordineIds, input.pianoId);
  const testo = testoConRiferimento(input.testo, confermato.documento.codice);
  const { data, error } = await input.supabase.rpc("prenota_invio_approvvigionamento", {
    p_chiave: chiaveInvioConfermato(input.chiaveSalvataggio),
    p_ordine_id: confermato.ordineId,
    p_piano_id: confermato.pianoId,
    p_revisione: confermato.revisione,
    p_destinatario: input.destinatario,
    p_oggetto: input.oggetto,
    p_testo: testo,
    p_pdf: input.pdf,
    p_xlsx: input.xlsx,
    p_snapshot: confermato.documento,
  });
  if (error) {
    return {
      id: null,
      stato: "non_inviata",
      richiedeConferma: false,
      errore: error.message || "Email non accodata.",
    };
  }
  const prenotato = comeOggetto(data);
  const documento = documentoDaSnapshot(prenotato.snapshot) ?? confermato.documento;
  const { data: lockData, error: erroreLock } = await input.supabase.rpc("acquisisci_invio_approvvigionamento", {
    p_id: String(prenotato.id),
    p_conferma_incerta: input.confermaIncerta,
  });
  if (erroreLock) {
    return {
      id: prenotato.id ? String(prenotato.id) : null,
      stato: "non_inviata",
      richiedeConferma: false,
      errore: erroreLock.message || "Invio non prenotato.",
    };
  }
  const lock = comeOggetto(lockData);
  const esito = await concludiTentativoInvio({
    acquisita: Boolean(lock.acquisita),
    statoAttuale: String(lock.stato ?? prenotato.stato ?? "non_inviata"),
    invia: async () => {
      const allegati = await allegatiConfermati({
        documento,
        pdf: Boolean(prenotato.pdf),
        xlsx: Boolean(prenotato.xlsx),
        pdfBytes: (documento) => pdfPianificazione(documento),
        xlsxBytes: (documento) => xlsxPianificazione(documento),
      });
      const inviata = await inviaDaCasellaAnagrafica({
        to: String(prenotato.destinatario),
        subject: String(prenotato.oggetto),
        text: String(prenotato.testo),
        soloSmtp: true,
        attachments: allegati,
      });
      return { messageId: inviata.messageId };
    },
    concludi: async (chiusura) => {
      const { data: chiusa, error: erroreChiusura } = await input.supabase.rpc(
        "concludi_invio_approvvigionamento",
        {
          p_id: String(prenotato.id),
          p_lock: String(lock.lock),
          p_esito: chiusura.esito,
          p_errore: chiusura.errore,
          p_message_id: chiusura.messageId,
        }
      );
      if (erroreChiusura) return false;
      return Boolean(comeOggetto(chiusa).aggiornata);
    },
  });
  return { ...esito, id: prenotato.id ? String(prenotato.id) : null };
}

export async function reinviaInvioConfermato(input: {
  supabase: Client;
  id: string;
  confermaIncerta: boolean;
}): Promise<EsitoInvioConfermato> {
  const { data, error } = await input.supabase.rpc("leggi_invio_approvvigionamento", { p_id: input.id });
  if (error) {
    return { id: input.id, stato: "non_inviata", richiedeConferma: false, errore: error.message || "Invio non trovato." };
  }
  const riga = comeOggetto(data);
  const documento = documentoDaSnapshot(riga.snapshot);
  if (!documento) {
    return { id: input.id, stato: "non_inviata", richiedeConferma: false, errore: "Versione confermata non ricostruibile." };
  }
  const { data: lockData, error: erroreLock } = await input.supabase.rpc("acquisisci_invio_approvvigionamento", {
    p_id: input.id,
    p_conferma_incerta: input.confermaIncerta,
  });
  if (erroreLock) {
    return { id: input.id, stato: "non_inviata", richiedeConferma: false, errore: erroreLock.message || "Invio non acquisito." };
  }
  const lock = comeOggetto(lockData);
  const esito = await concludiTentativoInvio({
    acquisita: Boolean(lock.acquisita),
    statoAttuale: String(lock.stato ?? riga.stato ?? "non_inviata"),
    invia: async () => {
      const allegati = await allegatiConfermati({
        documento,
        pdf: Boolean(riga.pdf),
        xlsx: Boolean(riga.xlsx),
        pdfBytes: (documento) => pdfPianificazione(documento),
        xlsxBytes: (documento) => xlsxPianificazione(documento),
      });
      const inviata = await inviaDaCasellaAnagrafica({
        to: String(riga.destinatario),
        subject: String(riga.oggetto),
        text: String(riga.testo),
        soloSmtp: true,
        attachments: allegati,
      });
      return { messageId: inviata.messageId };
    },
    concludi: async (chiusura) => {
      const { data: chiusa, error: erroreChiusura } = await input.supabase.rpc(
        "concludi_invio_approvvigionamento",
        {
          p_id: input.id,
          p_lock: String(lock.lock),
          p_esito: chiusura.esito,
          p_errore: chiusura.errore,
          p_message_id: chiusura.messageId,
        }
      );
      if (erroreChiusura) return false;
      return Boolean(comeOggetto(chiusa).aggiornata);
    },
  });
  return { ...esito, id: input.id };
}
