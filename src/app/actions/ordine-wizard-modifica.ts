"use server";

import { requireOrdineReadAccess } from "@/lib/auth/ordini-access";
import { emptyPagamentoPiano } from "@/lib/amministrazione/ordine-pagamento-piano";
import type { OrdinePagamentoPiano } from "@/lib/amministrazione/ordine-pagamento-piano";
import type { ConfezionamentoDraft } from "@/lib/amministrazione/imballaggi-spedizioni";
import { mapSpedizioneMailRow } from "@/lib/amministrazione/spedizione-mail";
import type { SpedizioneMailPrenotazione } from "@/lib/amministrazione/spedizione-mail";
import type { RubricaContatto } from "@/lib/rubrica/types";
import { createClient } from "@/lib/supabase/server";
import type { OrdineUnitaMisura } from "@/lib/amministrazione/ordini";

export type OrdineWizardModifica = {
  ordineId: string;
  numeroInterno: string;
  anagraficaFonte: "cliente" | "possibile";
  clienteId: string;
  possibileClienteId: string;
  cliente: string;
  codiceTarga: string;
  dataOrdine: string;
  tipo: "vendita" | "campionatura";
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  notaProdotto: string;
  quantita: number;
  unitaMisura: OrdineUnitaMisura;
  prezzoUnitario: number;
  scontoExtraPct: number;
  scontoAccordo: number | null;
  scontoSuddivisioneAttiva: boolean;
  scontoQuotaAziendaPct: number;
  scontoQuotaCommercialePct: number;
  consegnaTipo: "asap" | "data";
  dataRichiesta: string;
  urgente: boolean;
  usaMagazzino: boolean;
  usaSabato: boolean;
  dataDisponibilitaPresunta: string;
  corriereId: string;
  corriereDaCompilare: boolean;
  spedizioneACarico: "cliente" | "agrinsicilia" | "diviso";
  spedizionePctAgrinsicilia: number | null;
  destinatario: string;
  indirizzoSpedizione: string;
  preventivoId: string | null;
  webmailAccettazioneId: string | null;
  webmailAccettazioneSubject: string;
  webmailRichiestaId: string | null;
  webmailRichiestaSubject: string;
  referente: RubricaContatto | null;
  pagamentoPiano: OrdinePagamentoPiano;
  confezionamento: ConfezionamentoDraft;
  giorniProduzione: string[];
  giorniAttivita: string[];
  attivitaSnapshot: Array<{
    attivitaId: string;
    codice: string;
    titolo: string;
    dates: string[];
    modalitaTempo?: "throughput" | "durata_fissa";
    kgPerOra?: number;
    oreGiorno?: number;
    oreCiclo?: number | null;
    giorniOverride?: number | null;
  }>;
  dataConsegnaCalendario: string | null;
  resaOverride: number | null;
  kgEssiccatore: number | null;
  sedePartenzaId: string;
  mail: SpedizioneMailPrenotazione | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((d) => String(d)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
}

function buildNodi(
  rows: Array<Record<string, unknown>>,
  parentId: string | null
): ConfezionamentoDraft["nodi"] {
  return rows
    .filter((row) => (row.parent_id ? String(row.parent_id) : null) === parentId)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((row) => {
      const id = String(row.id);
      const stadio = String(row.stadio) as ConfezionamentoDraft["nodi"][number]["stadio"];
      return {
        localId: id,
        stadio,
        catalogoId: row.catalogo_id ? String(row.catalogo_id) : null,
        nome: String(row.nome_snapshot ?? ""),
        codice: String(row.codice_snapshot ?? ""),
        quantita: Number(row.quantita ?? 1),
        kgProdotto:
          row.kg_prodotto == null ? null : Number(row.kg_prodotto),
        children: buildNodi(rows, id),
      };
    });
}

export async function loadOrdinePerModificaWizardAction(
  ordineId: string
): Promise<
  | { success: true; draft: OrdineWizardModifica }
  | { success: false; error: string }
> {
  await requireOrdineReadAccess();
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("ordini")
    .select("*")
    .eq("id", ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Ordine non trovato." };
  }
  const ordine = row as Record<string, unknown>;
  const { data: righe } = await supabase
    .from("ordini_righe")
    .select("*")
    .eq("ordine_id", ordineId)
    .order("sort_order", { ascending: true });
  const riga = ((righe ?? [])[0] ?? null) as Record<string, unknown> | null;
  if (!riga?.prodotto_id) {
    return {
      success: false,
      error: "Questo ordine non ha un prodotto della procedura di inserimento.",
    };
  }

  const snap = asRecord(ordine.capacita_snapshot);
  const ripresa = asRecord(snap.ripresa);
  const { data: rate } = await supabase
    .from("ordini_pagamento_rate")
    .select("sort_order, importo, tipo_scadenza, data_pagamento, note")
    .eq("ordine_id", ordineId)
    .order("sort_order", { ascending: true });
  const pianoSalvato = ripresa.pagamentoPiano;
  const tipoUnica = String(ordine.tipo_pagamento ?? "alla_consegna");
  const pagamentoPiano: OrdinePagamentoPiano =
    pianoSalvato && typeof pianoSalvato === "object"
      ? (pianoSalvato as OrdinePagamentoPiano)
      : (rate ?? []).length > 0 && ordine.pagamento_modalita === "dilazione"
        ? {
            modalita: "dilazione",
            tipoUnica:
              (String((rate ?? [])[0]?.tipo_scadenza ?? tipoUnica) as OrdinePagamentoPiano["tipoUnica"]),
            rate: (rate ?? []).map((r, i) => ({
              sortOrder: Number(r.sort_order ?? i),
              importo: Number(r.importo ?? 0),
              tipoScadenza:
                (r.tipo_scadenza as OrdinePagamentoPiano["tipoUnica"] | null) ??
                null,
              dataPagamento: r.data_pagamento ? String(r.data_pagamento) : null,
              note: String(r.note ?? ""),
            })),
          }
        : emptyPagamentoPiano(
            (tipoUnica === "dilazionato"
              ? "alla_consegna"
              : tipoUnica) as OrdinePagamentoPiano["tipoUnica"]
          );

  const { data: confHead } = await supabase
    .from("ordini_confezionamento")
    .select(
      "id, movimentazione_modo, pallet_catalogo_id, pallet_misure_custom, coerenza_ignorata, note"
    )
    .eq("ordine_id", ordineId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let confezionamento: ConfezionamentoDraft = {
    movimentazioneModo: "su_pallet",
    palletCatalogoId: null,
    palletMisureCustom: "",
    nodi: [],
    coerenzaIgnorata: false,
    note: "",
  };
  if (confHead) {
    const { data: nodi } = await supabase
      .from("ordini_confezionamento_nodi")
      .select(
        "id, parent_id, stadio, catalogo_id, nome_snapshot, codice_snapshot, quantita, kg_prodotto, sort_order"
      )
      .eq("confezionamento_id", confHead.id)
      .is("deleted_at", null);
    confezionamento = {
      movimentazioneModo:
        confHead.movimentazione_modo === "nessun_pallet"
          ? "nessun_pallet"
          : "su_pallet",
      palletCatalogoId: confHead.pallet_catalogo_id
        ? String(confHead.pallet_catalogo_id)
        : null,
      palletMisureCustom: String(confHead.pallet_misure_custom ?? ""),
      coerenzaIgnorata: Boolean(confHead.coerenza_ignorata),
      note: String(confHead.note ?? ""),
      nodi: buildNodi((nodi ?? []) as Array<Record<string, unknown>>, null),
    };
  }

  const referenteId = ordine.referente_accettazione_id
    ? String(ordine.referente_accettazione_id)
    : "";
  let referente: RubricaContatto | null = null;
  if (referenteId) {
    const { data: contatto } = await supabase
      .from("rubrica_contatti")
      .select(
        "id, nome, cognome, telefono, email, rapporto, azienda_tipo, azienda_id, azienda_label, mansione_id, mansione, note, indirizzo, cap, citta, provincia, nazione, created_at, updated_at"
      )
      .eq("id", referenteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (contatto) {
      referente = {
        id: String(contatto.id),
        nome: String(contatto.nome ?? ""),
        cognome: String(contatto.cognome ?? ""),
        telefono: String(contatto.telefono ?? ""),
        email: String(contatto.email ?? ""),
        rapporto: (contatto.rapporto ?? "referente") as RubricaContatto["rapporto"],
        aziendaTipo: (contatto.azienda_tipo ??
          "nessuna") as RubricaContatto["aziendaTipo"],
        aziendaId: contatto.azienda_id ? String(contatto.azienda_id) : null,
        aziendaLabel: String(contatto.azienda_label ?? ""),
        mansioneId: contatto.mansione_id ? String(contatto.mansione_id) : null,
        mansione: String(contatto.mansione ?? ""),
        note: String(contatto.note ?? ""),
        indirizzo: String(contatto.indirizzo ?? ""),
        cap: String(contatto.cap ?? ""),
        citta: String(contatto.citta ?? ""),
        provincia: String(contatto.provincia ?? ""),
        nazione: String(contatto.nazione ?? ""),
        createdAt: String(contatto.created_at ?? ""),
        updatedAt: String(contatto.updated_at ?? ""),
      };
    }
  }

  const mailIds = [
    ordine.webmail_accettazione_id ? String(ordine.webmail_accettazione_id) : "",
    snap.webmail_richiesta_id ? String(snap.webmail_richiesta_id) : "",
  ].filter(Boolean);
  const subjects = new Map<string, string>();
  if (mailIds.length) {
    const { data: mails } = await supabase
      .from("webmail_messaggi")
      .select("id, subject")
      .in("id", mailIds);
    for (const mail of mails ?? []) {
      subjects.set(String(mail.id), String(mail.subject ?? ""));
    }
  }

  const { data: prenotazione } = await supabase
    .from("spedizione_mail_prenotazioni")
    .select(
      "id, entity_type, entity_id, stato, documento_stato, versione, tracking_url, lettera_via_path, lettera_via_name, allegati, allega_tracking, allega_lettera, allega_file, destinatario_email, oggetto, corpo, account_id, prenotata_at, inviata_at, created_at"
    )
    .eq("entity_type", "ordine")
    .eq("entity_id", ordineId)
    .is("deleted_at", null)
    .maybeSingle();

  const clienteId = ordine.cliente_id ? String(ordine.cliente_id) : "";
  const possibileId = ordine.cliente_possibile_id
    ? String(ordine.cliente_possibile_id)
    : "";
  const unita = String(riga.unita_misura ?? "kg");
  const unitaMisura = (
    ["g", "kg", "pz", "ml", "lt"].includes(unita) ? unita : "kg"
  ) as OrdineUnitaMisura;
  const prezzoListino =
    ordine.prezzo_listino_unitario != null
      ? Number(ordine.prezzo_listino_unitario)
      : null;
  const prezzoRipresa =
    typeof ripresa.prezzoUnitario === "number" ? ripresa.prezzoUnitario : null;
  const accettazioneId = ordine.webmail_accettazione_id
    ? String(ordine.webmail_accettazione_id)
    : null;
  const richiestaId = snap.webmail_richiesta_id
    ? String(snap.webmail_richiesta_id)
    : null;
  const attivitaRaw = Array.isArray(ripresa.attivitaSnapshot)
    ? ripresa.attivitaSnapshot
    : [];

  return {
    success: true,
    draft: {
      ordineId,
      numeroInterno: String(ordine.numero_interno ?? ""),
      anagraficaFonte: clienteId ? "cliente" : "possibile",
      clienteId,
      possibileClienteId: possibileId,
      cliente: String(ordine.cliente_ragione_sociale ?? ""),
      codiceTarga: String(ordine.cliente_codice_targa ?? ""),
      dataOrdine: String(ordine.data_ordine ?? ""),
      tipo: ordine.tipo === "campionatura" ? "campionatura" : "vendita",
      prodottoId: String(riga.prodotto_id),
      prodottoCodice: String(riga.prodotto_codice ?? ""),
      prodottoNome: String(riga.prodotto_nome ?? ""),
      notaProdotto: String(riga.note ?? "").trim(),
      quantita: Number(riga.quantita ?? 0),
      unitaMisura,
      prezzoUnitario: prezzoRipresa ?? prezzoListino ?? Number(riga.prezzo_unitario ?? 0),
      scontoExtraPct: Number(ordine.sconto_extra_pct ?? 0),
      scontoAccordo:
        typeof ripresa.scontoAccordo === "number"
          ? ripresa.scontoAccordo
          : riga.accordo_modalita === "sconto_percentuale"
            ? Number(riga.accordo_valore_origine ?? 0)
            : null,
      scontoSuddivisioneAttiva: Boolean(ordine.sconto_suddivisione_attiva),
      scontoQuotaAziendaPct: Number(ordine.sconto_quota_azienda_pct ?? 0),
      scontoQuotaCommercialePct: Number(ordine.sconto_quota_commerciale_pct ?? 0),
      consegnaTipo: ordine.consegna_tipo === "data" ? "data" : "asap",
      dataRichiesta:
        ordine.consegna_tipo === "data"
          ? String(ordine.data_consegna ?? ordine.data_consegna_stimata ?? "")
          : "",
      urgente: Boolean(ordine.urgente),
      usaMagazzino: Boolean(ordine.usa_magazzino),
      usaSabato: Boolean(ordine.usa_sabato),
      dataDisponibilitaPresunta: String(
        ordine.data_disponibilita_presunta ?? ""
      ),
      corriereId: ordine.corriere_id ? String(ordine.corriere_id) : "",
      corriereDaCompilare: Boolean(ordine.corriere_da_compilare),
      spedizioneACarico:
        ordine.spedizione_a_carico === "agrinsicilia" ||
        ordine.spedizione_a_carico === "diviso"
          ? ordine.spedizione_a_carico
          : "cliente",
      spedizionePctAgrinsicilia:
        ordine.spedizione_pct_agrinsicilia == null
          ? null
          : Number(ordine.spedizione_pct_agrinsicilia),
      destinatario: String(ordine.destinatario ?? ""),
      indirizzoSpedizione: String(ordine.indirizzo_spedizione ?? ""),
      preventivoId: ordine.preventivo_id ? String(ordine.preventivo_id) : null,
      webmailAccettazioneId: accettazioneId,
      webmailAccettazioneSubject: accettazioneId
        ? (subjects.get(accettazioneId) ?? "Mail di accettazione")
        : "",
      webmailRichiestaId: richiestaId,
      webmailRichiestaSubject: richiestaId
        ? (subjects.get(richiestaId) ?? "Mail di richiesta")
        : "",
      referente,
      pagamentoPiano,
      confezionamento,
      giorniProduzione: asDateList(ripresa.giorniProduzione),
      giorniAttivita: asDateList(ripresa.giorniAttivita),
      attivitaSnapshot: attivitaRaw
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const rowAtt = item as Record<string, unknown>;
          return {
            attivitaId: String(rowAtt.attivitaId ?? ""),
            codice: String(rowAtt.codice ?? ""),
            titolo: String(rowAtt.titolo ?? ""),
            dates: asDateList(rowAtt.dates),
            modalitaTempo:
              rowAtt.modalitaTempo === "durata_fissa" ||
              rowAtt.modalitaTempo === "throughput"
                ? rowAtt.modalitaTempo
                : undefined,
            kgPerOra:
              typeof rowAtt.kgPerOra === "number" ? rowAtt.kgPerOra : undefined,
            oreGiorno:
              typeof rowAtt.oreGiorno === "number" ? rowAtt.oreGiorno : undefined,
            oreCiclo:
              typeof rowAtt.oreCiclo === "number" ? rowAtt.oreCiclo : null,
            giorniOverride:
              typeof rowAtt.giorniOverride === "number"
                ? rowAtt.giorniOverride
                : null,
          };
        }),
      dataConsegnaCalendario:
        typeof ripresa.dataConsegnaCalendario === "string"
          ? ripresa.dataConsegnaCalendario
          : null,
      resaOverride:
        typeof ripresa.resaPercentualeOverride === "number"
          ? ripresa.resaPercentualeOverride
          : null,
      kgEssiccatore:
        typeof ripresa.kgEssiccatore === "number" ? ripresa.kgEssiccatore : null,
      sedePartenzaId: ordine.sede_partenza_id
        ? String(ordine.sede_partenza_id)
        : "",
      mail: prenotazione
        ? mapSpedizioneMailRow(prenotazione as Record<string, unknown>)
        : null,
    },
  };
}
