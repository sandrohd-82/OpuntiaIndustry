export type SecondFactorMethod = "email" | "app";

export type AppRoleCode =
  | "superadmin"
  | "admin"
  | "manager"
  | "operator"
  | "viewer";

export type AreaSlug =
  | "dashboard"
  | "commerciale"
  | "produzione"
  | "magazzino"
  | "acquisti"
  | "hr"
  | "area-fiscale"
  | "amministrazione"
  | "chat"
  | "promemorie-e-note"
  | "area-fornitori"
  | "ricerca-sviluppo"
  | "impostazioni";

export interface AppRole {
  id: string;
  code: AppRoleCode;
  name: string;
  description: string | null;
}

export interface Area {
  id: string;
  slug: AreaSlug;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  role_id: string;
  is_active: boolean;
  chat_status?: "available" | "away" | "offline";
  chat_rubrica_banned_at?: string | null;
  avatar_url?: string | null;
  app_roles?: AppRole;
}

export interface UserArea {
  area_id: string;
  slug: AreaSlug;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
}

export interface AuthSession2fa {
  id: string;
  user_id: string;
  session_token_hash: string;
  verified_at: string;
  expires_at: string;
  created_at: string;
}

export interface UserSecondFactor {
  user_id: string;
  method: SecondFactorMethod;
  otp_hash: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
  totp_secret_encrypted: string | null;
  verified_at: string | null;
  updated_at: string;
}

/** Tipi Insert/Update espliciti (formato Supabase codegen) */
export interface UserSecondFactorInsert {
  user_id: string;
  method?: SecondFactorMethod;
  otp_hash?: string | null;
  otp_expires_at?: string | null;
  otp_attempts?: number;
  totp_secret_encrypted?: string | null;
  verified_at?: string | null;
  updated_at?: string;
}

export interface UserSecondFactorUpdate {
  user_id?: string;
  method?: SecondFactorMethod;
  otp_hash?: string | null;
  otp_expires_at?: string | null;
  otp_attempts?: number;
  totp_secret_encrypted?: string | null;
  verified_at?: string | null;
  updated_at?: string;
}

export interface AuthSession2faInsert {
  id?: string;
  user_id: string;
  session_token_hash: string;
  verified_at?: string;
  expires_at: string;
  created_at?: string;
}

export interface AuthSession2faUpdate {
  id?: string;
  user_id?: string;
  session_token_hash?: string;
  verified_at?: string;
  expires_at?: string;
  created_at?: string;
}

export type FornitoreTipologia =
  | "servizio"
  | "prodotto"
  | "materia_prima"
  | "contributo";

export interface FornitoreRow {
  id: string;
  codice_targa: string;
  ragione_sociale: string;
  partita_iva: string;
  /** Presente dopo migrazione 20260814120000; opzionale finché non applicata in prod. */
  codice_fiscale?: string;
  email: string;
  pec: string;
  sdi_code: string;
  telefono: string;
  sito_web: string;
  sede_amm_nazione: string;
  sede_amm_provincia: string;
  sede_amm_citta: string;
  sede_amm_cap: string;
  sede_amm_indirizzo: string;
  sede_mag_nazione: string;
  sede_mag_provincia: string;
  sede_mag_citta: string;
  sede_mag_cap: string;
  sede_mag_indirizzo: string;
  tipologie: FornitoreTipologia[];
  servizi_offerti: string[];
  prodotti_fornitore: string[];
  prodotti_acquistati: string[];
  contributi_offerti: string[];
  bio_certificato: string;
  bio_certificato_path: string;
  bio_codice: string;
  anagrafica_fonte: string | null;
  verified_by: string | null;
  verified_at: string | null;
  enrichment_snapshot: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface FornitoreInsert {
  id?: string;
  codice_targa?: string;
  ragione_sociale: string;
  partita_iva: string;
  codice_fiscale?: string;
  email?: string;
  pec?: string;
  sdi_code?: string;
  telefono?: string;
  sito_web?: string;
  sede_amm_nazione: string;
  sede_amm_provincia: string;
  sede_amm_citta: string;
  sede_amm_cap: string;
  sede_amm_indirizzo: string;
  sede_mag_nazione: string;
  sede_mag_provincia: string;
  sede_mag_citta: string;
  sede_mag_cap: string;
  sede_mag_indirizzo: string;
  tipologie?: FornitoreTipologia[];
  servizi_offerti?: string[];
  prodotti_fornitore?: string[];
  prodotti_acquistati?: string[];
  contributi_offerti?: string[];
  bio_certificato?: string;
  bio_certificato_path?: string;
  bio_codice?: string;
  anagrafica_fonte?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  enrichment_snapshot?: Record<string, unknown> | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface FornitoreUpdate {
  id?: string;
  codice_targa?: string;
  ragione_sociale?: string;
  partita_iva?: string;
  codice_fiscale?: string;
  email?: string;
  pec?: string;
  sdi_code?: string;
  telefono?: string;
  sito_web?: string;
  sede_amm_nazione?: string;
  sede_amm_provincia?: string;
  sede_amm_citta?: string;
  sede_amm_cap?: string;
  sede_amm_indirizzo?: string;
  sede_mag_nazione?: string;
  sede_mag_provincia?: string;
  sede_mag_citta?: string;
  sede_mag_cap?: string;
  sede_mag_indirizzo?: string;
  tipologie?: FornitoreTipologia[];
  servizi_offerti?: string[];
  prodotti_fornitore?: string[];
  prodotti_acquistati?: string[];
  contributi_offerti?: string[];
  bio_certificato?: string;
  bio_certificato_path?: string;
  bio_codice?: string;
  anagrafica_fonte?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  enrichment_snapshot?: Record<string, unknown> | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export type ClienteConsegnaAltraAziendaRow = {
  ragione_sociale: string;
  nazione: string;
  provincia: string;
  citta: string;
  cap: string;
  indirizzo: string;
};

export interface ClienteRow {
  id: string;
  codice_targa: string;
  ragione_sociale: string;
  partita_iva: string;
  codice_fiscale: string;
  is_privato: boolean;
  email: string;
  pec: string;
  sdi_code: string;
  telefono: string;
  sito_web: string;
  sede_amm_nazione: string;
  sede_amm_provincia: string;
  sede_amm_citta: string;
  sede_amm_cap: string;
  sede_amm_indirizzo: string;
  sede_mag_nazione: string;
  sede_mag_provincia: string;
  sede_mag_citta: string;
  sede_mag_cap: string;
  sede_mag_indirizzo: string;
  prodotti_acquistati: string[];
  consegne_altra_azienda: ClienteConsegnaAltraAziendaRow[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface ClienteInsert {
  id?: string;
  codice_targa?: string;
  ragione_sociale: string;
  partita_iva?: string;
  codice_fiscale?: string;
  is_privato?: boolean;
  email?: string;
  pec?: string;
  sdi_code?: string;
  telefono?: string;
  sito_web?: string;
  sede_amm_nazione: string;
  sede_amm_provincia: string;
  sede_amm_citta: string;
  sede_amm_cap: string;
  sede_amm_indirizzo: string;
  sede_mag_nazione: string;
  sede_mag_provincia: string;
  sede_mag_citta: string;
  sede_mag_cap: string;
  sede_mag_indirizzo: string;
  prodotti_acquistati?: string[];
  consegne_altra_azienda?: ClienteConsegnaAltraAziendaRow[];
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface ClienteUpdate {
  id?: string;
  codice_targa?: string;
  ragione_sociale?: string;
  partita_iva?: string;
  codice_fiscale?: string;
  is_privato?: boolean;
  email?: string;
  pec?: string;
  sdi_code?: string;
  telefono?: string;
  sito_web?: string;
  sede_amm_nazione?: string;
  sede_amm_provincia?: string;
  sede_amm_citta?: string;
  sede_amm_cap?: string;
  sede_amm_indirizzo?: string;
  sede_mag_nazione?: string;
  sede_mag_provincia?: string;
  sede_mag_citta?: string;
  sede_mag_cap?: string;
  sede_mag_indirizzo?: string;
  prodotti_acquistati?: string[];
  consegne_altra_azienda?: ClienteConsegnaAltraAziendaRow[];
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface MateriaPrimaRow {
  id: string;
  codice: string;
  nome: string;
  note: string;
  is_bio: boolean;
  fornitore_bio_id: string | null;
  bio_certificato: string;
  bio_codice: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  pending_delete_at: string | null;
  pending_delete_by: string | null;
}

export interface MateriaPrimaInsert {
  id?: string;
  codice: string;
  nome: string;
  note?: string;
  is_bio?: boolean;
  fornitore_bio_id?: string | null;
  bio_certificato?: string;
  bio_codice?: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface MateriaPrimaUpdate {
  id?: string;
  codice?: string;
  nome?: string;
  note?: string;
  is_bio?: boolean;
  fornitore_bio_id?: string | null;
  bio_certificato?: string;
  bio_codice?: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface ProdottoProprioRow {
  id: string;
  codice: string;
  nome: string;
  note: string;
  is_bio: boolean;
  scheda_tecnica_path?: string;
  prezzo_listino?: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface ProdottoProprioInsert {
  id?: string;
  codice: string;
  nome: string;
  note?: string;
  is_bio?: boolean;
  scheda_tecnica_path?: string;
  prezzo_listino?: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface ProdottoProprioUpdate {
  id?: string;
  codice?: string;
  nome?: string;
  note?: string;
  is_bio?: boolean;
  scheda_tecnica_path?: string;
  prezzo_listino?: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export type AttivitaDocumentoStato = "bozza" | "approvato" | "chiuso";

export interface AttivitaRow {
  id: string;
  codice: string;
  titolo: string;
  spiegazione: string;
  kg_per_ora: number;
  ore_giorno: number;
  modalita_tempo: "throughput" | "durata_fissa";
  ore_ciclo: number | string | null;
  quantita_modo: "fissa" | "range" | "variabile" | "nessuna" | null;
  quantita_valore: number | string | null;
  quantita_da: number | string | null;
  quantita_a: number | string | null;
  quantita_unita: string;
  operatori_necessari: number;
  formazione_codice: string | null;
  tempo_multiplo: boolean;
  incastrabile_durante_lavorazione: boolean;
  documento_stato: AttivitaDocumentoStato;
  versione: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface AttivitaInsert {
  id?: string;
  codice: string;
  titolo: string;
  spiegazione?: string;
  kg_per_ora: number;
  ore_giorno?: number;
  modalita_tempo?: "throughput" | "durata_fissa";
  ore_ciclo?: number | null;
  quantita_modo?: "fissa" | "range" | "variabile" | "nessuna" | null;
  quantita_valore?: number | null;
  quantita_da?: number | null;
  quantita_a?: number | null;
  quantita_unita?: string;
  operatori_necessari?: number;
  formazione_codice?: string | null;
  tempo_multiplo?: boolean;
  incastrabile_durante_lavorazione?: boolean;
  documento_stato?: AttivitaDocumentoStato;
  versione?: number;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface AttivitaUpdate {
  codice?: string;
  titolo?: string;
  spiegazione?: string;
  kg_per_ora?: number;
  ore_giorno?: number;
  modalita_tempo?: "throughput" | "durata_fissa";
  ore_ciclo?: number | null;
  quantita_modo?: "fissa" | "range" | "variabile" | "nessuna" | null;
  quantita_valore?: number | null;
  quantita_da?: number | null;
  quantita_a?: number | null;
  quantita_unita?: string;
  operatori_necessari?: number;
  formazione_codice?: string | null;
  tempo_multiplo?: boolean;
  incastrabile_durante_lavorazione?: boolean;
  documento_stato?: AttivitaDocumentoStato;
  versione?: number;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface AttivitaTempoOpzioneRow {
  id: string;
  attivita_id: string;
  nome: string;
  quantita_valore: number;
  quantita_unita: string;
  ore: number;
  minuti: number;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface AttivitaTempoOpzioneInsert {
  id?: string;
  attivita_id: string;
  nome: string;
  quantita_valore: number;
  quantita_unita?: string;
  ore?: number;
  minuti?: number;
  sort_order?: number;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface ProdottoProprioAttivitaRow {
  id: string;
  prodotto_id: string;
  attivita_id: string;
  sort_order: number;
  /** true = proposta attiva in calendario; false = facoltativa (off di default) */
  obbligatoria: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type OrdineStato = "ricevuto" | "evaso" | "storico";
export type OrdineOrigineStorico = "manuale" | "chiusura";
export type OrdineDocumentoStato =
  | "bozza"
  | "registrato"
  | "approvato"
  | "chiuso";
export type OrdineTipoPagamento =
  | "anticipato"
  | "alla_consegna"
  | "posticipato"
  | "dilazionato";

export type OrdineConsegnaTipo = "asap" | "data";

export interface OrdineRow {
  id: string;
  numero_interno: string;
  numero_cliente: string;
  cliente_id: string | null;
  cliente_ragione_sociale: string;
  cliente_codice_targa: string;
  data_ordine: string;
  data_consegna: string | null;
  stato: OrdineStato;
  origine_storico: OrdineOrigineStorico | null;
  source_ordine_id: string | null;
  trasporto_azienda: string;
  trasporto_imponibile: number;
  trasporto_iva_percentuale: number;
  importo_euro: number;
  note: string;
  tipo_pagamento: OrdineTipoPagamento;
  pagato: boolean;
  data_pagamento: string | null;
  note_rateizzazione: string;
  ricevuta_pagamento_storage_path: string;
  ricevuta_pagamento_file_name: string;
  offerta_storage_path: string;
  offerta_file_name: string;
  ordine_cliente_storage_path: string;
  ordine_cliente_file_name: string;
  versione: number;
  documento_stato: OrdineDocumentoStato;
  consegna_tipo: OrdineConsegnaTipo | null;
  urgente: boolean;
  usa_magazzino: boolean;
  usa_sabato: boolean;
  data_consegna_stimata: string | null;
  capacita_snapshot: Record<string, unknown>;
  is_test: boolean;
  spedizione_mezzo: "corriere";
  corriere_id: string | null;
  corriere_da_compilare: boolean;
  spedizione_a_carico: "cliente" | "agrinsicilia" | "diviso" | null;
  spedizione_pct_agrinsicilia: number | null;
  giorni_produzione: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface OrdineInsert {
  id?: string;
  numero_interno: string;
  numero_cliente?: string;
  cliente_id?: string | null;
  cliente_ragione_sociale: string;
  cliente_codice_targa: string;
  data_ordine: string;
  data_consegna?: string | null;
  stato: OrdineStato;
  origine_storico?: OrdineOrigineStorico | null;
  source_ordine_id?: string | null;
  trasporto_azienda?: string;
  trasporto_imponibile?: number;
  trasporto_iva_percentuale?: number;
  importo_euro?: number;
  note?: string;
  tipo_pagamento?: OrdineTipoPagamento;
  pagato?: boolean;
  data_pagamento?: string | null;
  note_rateizzazione?: string;
  ricevuta_pagamento_storage_path?: string;
  ricevuta_pagamento_file_name?: string;
  offerta_storage_path?: string;
  offerta_file_name?: string;
  ordine_cliente_storage_path?: string;
  ordine_cliente_file_name?: string;
  versione?: number;
  documento_stato?: OrdineDocumentoStato;
  consegna_tipo?: OrdineConsegnaTipo | null;
  urgente?: boolean;
  usa_magazzino?: boolean;
  usa_sabato?: boolean;
  data_consegna_stimata?: string | null;
  capacita_snapshot?: Record<string, unknown>;
  is_test?: boolean;
  spedizione_mezzo?: "corriere";
  corriere_id?: string | null;
  corriere_da_compilare?: boolean;
  spedizione_a_carico?: "cliente" | "agrinsicilia" | "diviso" | null;
  spedizione_pct_agrinsicilia?: number | null;
  giorni_produzione?: string[];
  created_by?: string | null;
  updated_by?: string | null;
}

export interface OrdineUpdate {
  numero_interno?: string;
  numero_cliente?: string;
  cliente_id?: string | null;
  cliente_ragione_sociale?: string;
  cliente_codice_targa?: string;
  data_ordine?: string;
  data_consegna?: string | null;
  stato?: OrdineStato;
  origine_storico?: OrdineOrigineStorico | null;
  trasporto_azienda?: string;
  trasporto_imponibile?: number;
  trasporto_iva_percentuale?: number;
  importo_euro?: number;
  note?: string;
  tipo_pagamento?: OrdineTipoPagamento;
  pagato?: boolean;
  data_pagamento?: string | null;
  note_rateizzazione?: string;
  ricevuta_pagamento_storage_path?: string;
  ricevuta_pagamento_file_name?: string;
  offerta_storage_path?: string;
  offerta_file_name?: string;
  ordine_cliente_storage_path?: string;
  ordine_cliente_file_name?: string;
  versione?: number;
  documento_stato?: OrdineDocumentoStato;
  consegna_tipo?: OrdineConsegnaTipo | null;
  urgente?: boolean;
  usa_magazzino?: boolean;
  usa_sabato?: boolean;
  data_consegna_stimata?: string | null;
  capacita_snapshot?: Record<string, unknown>;
  is_test?: boolean;
  spedizione_mezzo?: "corriere";
  corriere_id?: string | null;
  corriere_da_compilare?: boolean;
  spedizione_a_carico?: "cliente" | "agrinsicilia" | "diviso" | null;
  spedizione_pct_agrinsicilia?: number | null;
  giorni_produzione?: string[];
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface ProduzioneCalendarioImpegnoRow {
  id: string;
  data_giorno: string;
  ordine_id: string | null;
  linea_codice: string | null;
  etichetta: string;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type ProduzioneCalendarioImpegnoInsert = {
  id?: string;
  data_giorno: string;
  ordine_id?: string | null;
  linea_codice?: string | null;
  etichetta?: string;
  note?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ImballaggioStadio = "movimentazione" | "confezione" | "isolamento";

export interface ImballaggioVoceRow {
  id: string;
  stadio: ImballaggioStadio;
  codice: string;
  nome: string;
  largo_mm: number | null;
  profondita_mm: number | null;
  altezza_mm: number | null;
  capacita_lt: number | null;
  note: string;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type ImballaggioVoceInsert = {
  id?: string;
  stadio: ImballaggioStadio;
  codice: string;
  nome: string;
  largo_mm?: number | null;
  profondita_mm?: number | null;
  altezza_mm?: number | null;
  capacita_lt?: number | null;
  note?: string;
  sort_order?: number;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ImballaggioVoceUpdate = Partial<ImballaggioVoceInsert> & {
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export interface CorriereRow {
  id: string;
  nome: string;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type CorriereInsert = {
  id?: string;
  nome: string;
  note?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type CorriereUpdate = Partial<CorriereInsert> & {
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type OrdineConfezionamentoModo = "su_pallet" | "nessun_pallet";
export type OrdineConfezionamentoNodoStadio =
  | ImballaggioStadio
  | "prodotto_kg";

export interface OrdineConfezionamentoRow {
  id: string;
  ordine_id: string;
  movimentazione_modo: OrdineConfezionamentoModo;
  pallet_catalogo_id: string | null;
  pallet_misure_custom: string;
  kg_ordine: number;
  kg_confezionati: number;
  kg_delta: number;
  coerenza_ignorata: boolean;
  note: string;
  versione: number;
  documento_stato: "bozza" | "approvato" | "chiuso";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type OrdineConfezionamentoInsert = {
  id?: string;
  ordine_id: string;
  movimentazione_modo?: OrdineConfezionamentoModo;
  pallet_catalogo_id?: string | null;
  pallet_misure_custom?: string;
  kg_ordine?: number;
  kg_confezionati?: number;
  kg_delta?: number;
  coerenza_ignorata?: boolean;
  note?: string;
  versione?: number;
  documento_stato?: "bozza" | "approvato" | "chiuso";
  created_by?: string | null;
  updated_by?: string | null;
};

export interface OrdineConfezionamentoNodoRow {
  id: string;
  confezionamento_id: string;
  parent_id: string | null;
  stadio: OrdineConfezionamentoNodoStadio;
  catalogo_id: string | null;
  nome_snapshot: string;
  codice_snapshot: string;
  quantita: number;
  kg_prodotto: number | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type OrdineConfezionamentoNodoInsert = {
  id?: string;
  confezionamento_id: string;
  parent_id?: string | null;
  stadio: OrdineConfezionamentoNodoStadio;
  catalogo_id?: string | null;
  nome_snapshot?: string;
  codice_snapshot?: string;
  quantita?: number;
  kg_prodotto?: number | null;
  sort_order?: number;
  created_by?: string | null;
  updated_by?: string | null;
};

export interface OrdineRigaRow {
  id: string;
  ordine_id: string;
  prodotto_id: string | null;
  prodotto_codice: string;
  prodotto_nome: string;
  quantita: number;
  prezzo_unitario: number;
  iva_percentuale: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OrdineRigaInsert {
  id?: string;
  ordine_id: string;
  prodotto_id?: string | null;
  prodotto_codice?: string;
  prodotto_nome?: string;
  quantita?: number;
  prezzo_unitario?: number;
  iva_percentuale?: number;
  sort_order?: number;
}

export interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogInsert {
  id?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id?: string | null;
  summary?: string;
  payload?: Record<string, unknown>;
}

export type FatturaStatoPagamento = "pagato" | "da_pagare" | "annullata";
export type FatturaDilazioneStatoPagamento =
  | "pagato"
  | "da_pagare"
  | "annullata";
/** Solo fatture ricevute: acconto vs saldo. */
export type FatturaNaturaDocumento = "acconto" | "saldo";
export type FatturaDocumentoStato = "bozza" | "registrata" | "chiusa";
export type FatturaTipoDocumento = "fattura" | "nota_credito";
export type FatturaStatoIncassoNc = "gia_incassata" | "non_incassata";
export type FatturaRimborsoMezzo =
  | "denaro"
  | "rimpiazzo_merce"
  | "nuova_fattura";
export type FatturaModalitaCollegamentoNc = "normale" | "sostituzione";

export interface FatturaEmessaRow {
  id: string;
  numero_interno: string;
  cliente_id: string;
  cliente_ragione_sociale: string;
  cliente_codice_targa: string;
  data_emissione: string;
  numero_documento_esterno: string;
  fic_id: number | null;
  spedizione: number;
  spedizione_iva_applicata: boolean;
  spedizione_iva_percentuale: number;
  spedizione_sottrai_incassi: boolean;
  imponibile: number;
  iva_percentuale: number;
  imposta: number;
  totale: number;
  stato_pagamento: FatturaStatoPagamento;
  stato_incasso_nc: FatturaStatoIncassoNc | null;
  rimborso_necessario: boolean | null;
  rimborso_mezzo: FatturaRimborsoMezzo | null;
  fattura_compensativa_id: string | null;
  modalita_collegamento: FatturaModalitaCollegamentoNc | null;
  fattura_sostitutiva_id: string | null;
  ricevuta_storage_path: string;
  ricevuta_file_name: string;
  versione: number;
  documento_stato: FatturaDocumentoStato;
  note: string;
  tipo_documento: FatturaTipoDocumento;
  fattura_collegata_id: string | null;
  riferimento_fattura_esterno: string;
  annullata_da_nc_id: string | null;
  annullata_at: string | null;
  annullata_by: string | null;
  numero_fattura: string;
  pdf_url: string;
  ei_status: string;
  payment_method: string;
  iban: string;
  data_scadenza: string | null;
  ordine_id: string | null;
  courtesy_email_sent: boolean;
  emissione_errore: string;
  /** Origine registrazione: manuale | sync_fic | emissione_gestionale */
  origine: "manuale" | "sync_fic" | "emissione_gestionale";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type FatturaEmessaInsert = {
  id?: string;
  numero_interno: string;
  cliente_id: string;
  cliente_ragione_sociale: string;
  cliente_codice_targa: string;
  data_emissione: string;
  numero_documento_esterno?: string;
  fic_id?: number | null;
  spedizione?: number;
  spedizione_iva_applicata?: boolean;
  spedizione_iva_percentuale?: number;
  spedizione_sottrai_incassi?: boolean;
  imponibile?: number;
  iva_percentuale?: number;
  imposta?: number;
  totale?: number;
  stato_pagamento?: FatturaStatoPagamento;
  stato_incasso_nc?: FatturaStatoIncassoNc | null;
  rimborso_necessario?: boolean | null;
  rimborso_mezzo?: FatturaRimborsoMezzo | null;
  fattura_compensativa_id?: string | null;
  modalita_collegamento?: FatturaModalitaCollegamentoNc | null;
  fattura_sostitutiva_id?: string | null;
  ricevuta_storage_path?: string;
  ricevuta_file_name?: string;
  versione?: number;
  documento_stato?: FatturaDocumentoStato;
  note?: string;
  tipo_documento?: FatturaTipoDocumento;
  fattura_collegata_id?: string | null;
  riferimento_fattura_esterno?: string;
  numero_fattura?: string;
  pdf_url?: string;
  ei_status?: string;
  payment_method?: string;
  iban?: string;
  data_scadenza?: string | null;
  ordine_id?: string | null;
  courtesy_email_sent?: boolean;
  emissione_errore?: string;
  origine?: "manuale" | "sync_fic" | "emissione_gestionale";
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type FatturaEmessaUpdate = Partial<FatturaEmessaInsert>;

export interface FatturaEmessaRigaRow {
  id: string;
  fattura_id: string;
  prodotto_id: string | null;
  codice: string;
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  sconto_percentuale: number;
  importo: number;
  sort_order: number;
  iva_percentuale: number;
  is_spedizione: boolean;
  note: string;
  is_bene_ammortizzabile: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type FatturaEmessaRigaInsert = {
  id?: string;
  fattura_id: string;
  prodotto_id?: string | null;
  codice?: string;
  descrizione?: string;
  quantita?: number;
  prezzo_unitario?: number;
  sconto_percentuale?: number;
  importo?: number;
  sort_order?: number;
  iva_percentuale?: number;
  is_spedizione?: boolean;
  note?: string;
  is_bene_ammortizzabile?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
};

export interface FatturaRicevutaRow {
  id: string;
  numero_interno: string;
  fornitore_id: string;
  fornitore_ragione_sociale: string;
  fornitore_codice_targa: string;
  data_emissione: string;
  numero_documento_esterno: string;
  fic_id: number | null;
  spedizione: number;
  spedizione_iva_applicata: boolean;
  spedizione_iva_percentuale: number;
  imponibile: number;
  iva_percentuale: number;
  imposta: number;
  totale: number;
  /** Totale lordo da Fatture in Cloud (amount_gross), se noto. */
  totale_fic: number | null;
  /** Differenza totale documento − totale_fic. */
  totale_scarto: number | null;
  stato_pagamento: FatturaStatoPagamento;
  natura_documento: FatturaNaturaDocumento;
  ricevuta_storage_path: string;
  ricevuta_file_name: string;
  versione: number;
  documento_stato: FatturaDocumentoStato;
  note: string;
  richiede_aggiornamento_catalogo: boolean;
  codice_catalogo_pending: string | null;
  totale_manuale: boolean;
  totale_forzato_at: string | null;
  totale_forzato_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type FatturaRicevutaInsert = {
  id?: string;
  numero_interno: string;
  fornitore_id: string;
  fornitore_ragione_sociale: string;
  fornitore_codice_targa: string;
  data_emissione: string;
  numero_documento_esterno?: string;
  fic_id?: number | null;
  spedizione?: number;
  spedizione_iva_applicata?: boolean;
  spedizione_iva_percentuale?: number;
  imponibile?: number;
  iva_percentuale?: number;
  imposta?: number;
  totale?: number;
  totale_fic?: number | null;
  totale_scarto?: number | null;
  stato_pagamento?: FatturaStatoPagamento;
  natura_documento?: FatturaNaturaDocumento;
  ricevuta_storage_path?: string;
  ricevuta_file_name?: string;
  versione?: number;
  documento_stato?: FatturaDocumentoStato;
  note?: string;
  totale_manuale?: boolean;
  totale_forzato_at?: string | null;
  totale_forzato_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type FatturaRicevutaUpdate = Partial<FatturaRicevutaInsert>;

export interface FatturaRicevutaRigaRow {
  id: string;
  fattura_id: string;
  prodotto_id: string | null;
  codice: string;
  descrizione: string;
  quantita: number;
  unita_misura: string;
  prezzo_unitario: number;
  sconto_percentuale: number;
  iva_percentuale: number;
  importo: number;
  sort_order: number;
  is_bene_ammortizzabile: boolean;
  ai_match_data: Record<string, unknown>;
  verification_status: "AUTO_MATCHED" | "NEEDS_REVIEW" | "VERIFIED";
  ai_verified_by: string | null;
  ai_verified_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type FatturaRicevutaRigaInsert = {
  id?: string;
  fattura_id: string;
  prodotto_id?: string | null;
  codice?: string;
  descrizione?: string;
  quantita?: number;
  unita_misura?: string;
  prezzo_unitario?: number;
  sconto_percentuale?: number;
  iva_percentuale?: number;
  importo?: number;
  sort_order?: number;
  is_bene_ammortizzabile?: boolean;
  ai_match_data?: Record<string, unknown>;
  verification_status?: "AUTO_MATCHED" | "NEEDS_REVIEW" | "VERIFIED";
  ai_verified_by?: string | null;
  ai_verified_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ElaborazioneContabileKind = "emessa" | "ricevuta";
export type ElaborazioneContabileDocumentoStato =
  | "bozza"
  | "approvato"
  | "chiuso";

export interface ElaborazioneContabileRow {
  id: string;
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: number;
  documento_stato: ElaborazioneContabileDocumentoStato;
  versione: number;
  note: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type ElaborazioneContabileInsert = {
  id?: string;
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: number;
  documento_stato?: ElaborazioneContabileDocumentoStato;
  versione?: number;
  note?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ElaborazioneContabileUpdate =
  Partial<ElaborazioneContabileInsert> & {
    deleted_at?: string | null;
    deleted_by?: string | null;
  };

/** Date personalizzate trimestre commercialista (ISO 9001). */
export interface TrimestreCommercialistaRow {
  id: string;
  anno: number;
  trimestre: number;
  dal: string;
  al: string;
  note: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type TrimestreCommercialistaInsert = {
  id?: string;
  anno: number;
  trimestre: number;
  dal: string;
  al: string;
  note?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type TrimestreCommercialistaUpdate =
  Partial<TrimestreCommercialistaInsert> & {
    deleted_at?: string | null;
    deleted_by?: string | null;
  };

export interface ElaborazioneContabileVoceRow {
  id: string;
  elaborazione_id: string;
  fattura_id: string;
  numera_con_vignetta: boolean;
  numero_vignetta: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type ElaborazioneContabileVoceInsert = {
  id?: string;
  elaborazione_id: string;
  fattura_id: string;
  numera_con_vignetta?: boolean;
  numero_vignetta?: number | null;
  sort_order?: number;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ElaborazioneContabileVoceUpdate =
  Partial<ElaborazioneContabileVoceInsert> & {
    deleted_at?: string | null;
    deleted_by?: string | null;
  };

export interface FatturaEmessaDilazioneRow {
  id: string;
  fattura_id: string;
  data_scadenza: string;
  importo: number;
  stato_pagamento: FatturaDilazioneStatoPagamento;
  sort_order: number;
  note: string;
  annullata_at: string | null;
  annullata_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type FatturaEmessaDilazioneInsert = {
  id?: string;
  fattura_id: string;
  data_scadenza: string;
  importo?: number;
  stato_pagamento?: FatturaDilazioneStatoPagamento;
  sort_order?: number;
  note?: string;
  annullata_at?: string | null;
  annullata_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export interface FatturaRicevutaDilazioneRow {
  id: string;
  fattura_id: string;
  data_scadenza: string;
  importo: number;
  stato_pagamento: FatturaStatoPagamento;
  sort_order: number;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type FatturaRicevutaDilazioneInsert = {
  id?: string;
  fattura_id: string;
  data_scadenza: string;
  importo?: number;
  stato_pagamento?: FatturaStatoPagamento;
  sort_order?: number;
  note?: string;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

/** Contributo cassa previdenziale su fattura ricevuta (es. ENPAB 4%). */
export interface FatturaRicevutaContributoCassaRow {
  id: string;
  fattura_id: string;
  codice: string;
  percentuale: number;
  base_importo: number;
  importo: number;
  sort_order: number;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type FatturaRicevutaContributoCassaInsert = {
  id?: string;
  fattura_id: string;
  codice?: string;
  percentuale?: number;
  base_importo?: number;
  importo?: number;
  sort_order?: number;
  note?: string;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type FormaGiuridicaFiscale = "cooperativa_agricola_sociale_arl";
export type RegimeIvaFiscale = "ordinario" | "speciale_agricolo_art34";
export type IvaPeriodoFiscale = "mensile" | "trimestrale";
export type AdempimentoCategoria =
  | "iva"
  | "inps"
  | "ires"
  | "irap"
  | "f24"
  | "altro";
export type AdempimentoRicorrenza =
  | "mensile"
  | "trimestrale"
  | "annuale"
  | "una_tantum";
export type DashboardFiscalePeriodoTipo = "mese" | "trimestre" | "anno" | "custom";

export type FiscalTipoColtura = {
  codice: string;
  label: string;
  percentuale_compensazione: number;
  aliquota_iva: number;
};

export type FiscalInpsParametri = {
  contribuzione_otd_pct: number;
  contribuzione_oti_pct: number;
  sgravio_zona_svantaggiata_pct: number;
  stima_mensile_fissa_eur: number;
};

export interface CompanyFiscalProfileRow {
  id: string;
  company_key: string;
  forma_giuridica: FormaGiuridicaFiscale;
  regime_iva: RegimeIvaFiscale;
  iva_periodo: IvaPeriodoFiscale;
  cooperativa_sociale_l381: boolean;
  zona_svantaggiata: boolean;
  otd_count: number;
  oti_count: number;
  tipi_colture: FiscalTipoColtura[];
  inps_parametri: FiscalInpsParametri;
  aliquota_ires_pct: number;
  aliquota_irap_pct: number;
  aliquota_stima_generica_pct: number;
  note: string;
  open_data_enabled: boolean;
  open_data_last_sync_at: string | null;
  open_data_last_payload: Record<string, unknown>;
  versione: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type CompanyFiscalProfileInsert = {
  id?: string;
  company_key?: string;
  forma_giuridica?: FormaGiuridicaFiscale;
  regime_iva?: RegimeIvaFiscale;
  iva_periodo?: IvaPeriodoFiscale;
  cooperativa_sociale_l381?: boolean;
  zona_svantaggiata?: boolean;
  otd_count?: number;
  oti_count?: number;
  tipi_colture?: FiscalTipoColtura[];
  inps_parametri?: FiscalInpsParametri;
  aliquota_ires_pct?: number;
  aliquota_irap_pct?: number;
  aliquota_stima_generica_pct?: number;
  note?: string;
  open_data_enabled?: boolean;
  open_data_last_sync_at?: string | null;
  open_data_last_payload?: Record<string, unknown>;
  versione?: number;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type CompanyFiscalProfileUpdate = Partial<CompanyFiscalProfileInsert>;

export interface CompanyFiscalProfileAuditRow {
  id: string;
  profile_id: string;
  changed_at: string;
  changed_by: string | null;
  reason_for_change: string;
  previous_payload: Record<string, unknown>;
  next_payload: Record<string, unknown>;
  created_at: string;
}

export type CompanyFiscalProfileAuditInsert = {
  id?: string;
  profile_id: string;
  changed_at?: string;
  changed_by?: string | null;
  reason_for_change: string;
  previous_payload?: Record<string, unknown>;
  next_payload?: Record<string, unknown>;
};

export interface FiscalOpenDataCacheRow {
  id: string;
  source_key: string;
  source_label: string;
  source_url: string;
  fetched_at: string;
  payload: Record<string, unknown>;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdempimentoFiscaleRow {
  id: string;
  codice: string;
  titolo: string;
  descrizione: string;
  categoria: AdempimentoCategoria;
  ricorrenza: AdempimentoRicorrenza;
  giorno_mese: number | null;
  mese_anno: number | null;
  attivo: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export type AdempimentoFiscaleInsert = {
  id?: string;
  codice?: string;
  titolo: string;
  descrizione?: string;
  categoria?: AdempimentoCategoria;
  ricorrenza?: AdempimentoRicorrenza;
  giorno_mese?: number | null;
  mese_anno?: number | null;
  attivo?: boolean;
  sort_order?: number;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export interface DashboardFiscaleSnapshotRow {
  id: string;
  periodo_tipo: DashboardFiscalePeriodoTipo;
  periodo_label: string;
  periodo_dal: string;
  periodo_al: string;
  payload: Record<string, unknown>;
  profilo_versione: number;
  note: string;
  created_by: string | null;
  created_at: string;
}

export type DashboardFiscaleSnapshotInsert = {
  id?: string;
  periodo_tipo: DashboardFiscalePeriodoTipo;
  periodo_label: string;
  periodo_dal: string;
  periodo_al: string;
  payload: Record<string, unknown>;
  profilo_versione?: number;
  note?: string;
  created_by?: string | null;
};

export type FicInvoiceKind = "issued" | "received";
export type FicPaymentStatus = "paid" | "not_paid" | "partially_paid";
export type FicSyncLogStatus = "running" | "success" | "error";

export interface FicInvoiceRow {
  id: string;
  fic_id: number;
  type: FicInvoiceKind;
  number: string;
  entity_name: string;
  entity_vat: string;
  amount_gross: number;
  date: string | null;
  due_date: string | null;
  status: FicPaymentStatus;
  raw_data: Record<string, unknown>;
  last_synced_at: string;
  cliente_id: string | null;
  fattura_emessa_id: string | null;
  pdf_url: string;
  ei_status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface FicInvoiceInsert {
  id?: string;
  fic_id: number;
  type: FicInvoiceKind;
  number?: string;
  entity_name?: string;
  entity_vat?: string;
  amount_gross?: number;
  date?: string | null;
  due_date?: string | null;
  status?: FicPaymentStatus;
  raw_data?: Record<string, unknown>;
  last_synced_at?: string;
  cliente_id?: string | null;
  fattura_emessa_id?: string | null;
  pdf_url?: string;
  ei_status?: string;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export type FicInvoiceUpdate = Partial<FicInvoiceInsert>;

export interface FicSyncLogRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: FicSyncLogStatus;
  documents_fetched: number;
  documents_upserted: number;
  since_at: string | null;
  error_message: string;
  details: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface FicSyncLogInsert {
  id?: string;
  started_at?: string;
  finished_at?: string | null;
  status?: FicSyncLogStatus;
  documents_fetched?: number;
  documents_upserted?: number;
  since_at?: string | null;
  error_message?: string;
  details?: Record<string, unknown>;
  created_by?: string | null;
}

export type FicSyncLogUpdate = Partial<
  Pick<
    FicSyncLogRow,
    | "finished_at"
    | "status"
    | "documents_fetched"
    | "documents_upserted"
    | "error_message"
    | "details"
  >
>;

export interface CatalogoServizioRow {
  id: string;
  codice: string;
  nome: string;
  note: string;
  is_bio: boolean;
  prezzo_unitario_medio?: number | null;
  prezzo_medio_count?: number;
  prezzo_medio_updated_at?: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  pending_delete_at: string | null;
  pending_delete_by: string | null;
}

export type CatalogoServizioInsert = {
  id?: string;
  codice: string;
  nome: string;
  note?: string;
  is_bio?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
};

export type CatalogoServizioUpdate = Partial<CatalogoServizioInsert> & {
  prezzo_unitario_medio?: number | null;
  prezzo_medio_count?: number;
  prezzo_medio_updated_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  pending_delete_at?: string | null;
  pending_delete_by?: string | null;
};

export interface CatalogoProdottoFornitoreRow {
  id: string;
  codice: string;
  nome: string;
  note: string;
  is_bio: boolean;
  prezzo_unitario_medio?: number | null;
  prezzo_medio_count?: number;
  prezzo_medio_updated_at?: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  pending_delete_at: string | null;
  pending_delete_by: string | null;
}

export type CatalogoProdottoFornitoreInsert = {
  id?: string;
  codice: string;
  nome: string;
  note?: string;
  is_bio?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
};

export type CatalogoProdottoFornitoreUpdate = Partial<CatalogoProdottoFornitoreInsert> & {
  prezzo_unitario_medio?: number | null;
  prezzo_medio_count?: number;
  prezzo_medio_updated_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  pending_delete_at?: string | null;
  pending_delete_by?: string | null;
};

export interface CatalogoContributoRow {
  id: string;
  codice: string;
  nome: string;
  note: string;
  is_bio: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  pending_delete_at: string | null;
  pending_delete_by: string | null;
}

export type CatalogoContributoInsert = {
  id?: string;
  codice: string;
  nome: string;
  note?: string;
  is_bio?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
};

export type CatalogoContributoUpdate = Partial<CatalogoContributoInsert> & {
  deleted_at?: string | null;
  deleted_by?: string | null;
  pending_delete_at?: string | null;
  pending_delete_by?: string | null;
};

export type AnagraficaArchivioMotivo =
  | "eliminata"
  | "scartata_sync"
  | "pulizia";

export type FatturaRicevutaCodificaKind =
  | "servizio"
  | "prodotto"
  | "materia"
  | "contributo";

export type FatturaRicevutaCodificaAzione =
  | "associa_esistente"
  | "crea_nuovo";

export interface FatturaRicevutaCodificaArticoloRow {
  id: string;
  fattura_ricevuta_id: string | null;
  fattura_riga_id: string | null;
  testo_originale: string;
  testo_normalizzato: string;
  codice_assegnato: string;
  catalogo_kind: FatturaRicevutaCodificaKind;
  catalogo_id: string | null;
  affinita_percentuale: number | null;
  azione: FatturaRicevutaCodificaAzione;
  note: string;
  created_by: string | null;
  created_at: string;
}

export type FatturaRicevutaCodificaArticoloInsert = {
  id?: string;
  fattura_ricevuta_id?: string | null;
  fattura_riga_id?: string | null;
  testo_originale: string;
  testo_normalizzato?: string;
  codice_assegnato: string;
  catalogo_kind: FatturaRicevutaCodificaKind;
  catalogo_id?: string | null;
  affinita_percentuale?: number | null;
  azione: FatturaRicevutaCodificaAzione;
  note?: string;
  created_by?: string | null;
};

export interface ClienteArchivioRow {
  id: string;
  partita_iva: string;
  ragione_sociale: string;
  fic_entity_id: number | null;
  motivo: AnagraficaArchivioMotivo;
  note: string;
  snapshot: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  ripescato_at: string | null;
  ripescato_by: string | null;
}

export type ClienteArchivioInsert = {
  id?: string;
  partita_iva?: string;
  ragione_sociale?: string;
  fic_entity_id?: number | null;
  motivo?: AnagraficaArchivioMotivo;
  note?: string;
  snapshot?: Record<string, unknown>;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ClienteArchivioUpdate = Partial<ClienteArchivioInsert> & {
  ripescato_at?: string | null;
  ripescato_by?: string | null;
};

export interface FornitoreArchivioRow {
  id: string;
  partita_iva: string;
  ragione_sociale: string;
  fic_entity_id: number | null;
  motivo: AnagraficaArchivioMotivo;
  note: string;
  snapshot: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  ripescato_at: string | null;
  ripescato_by: string | null;
}

export type FornitoreArchivioInsert = {
  id?: string;
  partita_iva?: string;
  ragione_sociale?: string;
  fic_entity_id?: number | null;
  motivo?: AnagraficaArchivioMotivo;
  note?: string;
  snapshot?: Record<string, unknown>;
  created_by?: string | null;
  updated_by?: string | null;
};

export type FornitoreArchivioUpdate = Partial<FornitoreArchivioInsert> & {
  ripescato_at?: string | null;
  ripescato_by?: string | null;
};

export type FicImportEntityKind = "supplier" | "client";

export interface FicImportDiscardedRow {
  id: string;
  entity_kind: FicImportEntityKind;
  fic_entity_id: number;
  entity_name: string;
  vat_number: string;
  note: string;
  created_by: string | null;
  created_at: string;
}

export interface FicImportDiscardedInsert {
  id?: string;
  entity_kind: FicImportEntityKind;
  fic_entity_id: number;
  entity_name?: string;
  vat_number?: string;
  note?: string;
  created_by?: string | null;
}

export type FicImportCheckpointStatus = "idle" | "in_progress" | "paused";

export interface FicImportCheckpointRow {
  entity_kind: FicImportEntityKind;
  status: FicImportCheckpointStatus;
  completed_fic_ids: number[];
  last_saved_fic_entity_id: number | null;
  last_saved_name: string;
  last_saved_vat: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FicImportCheckpointInsert {
  entity_kind: FicImportEntityKind;
  status?: FicImportCheckpointStatus;
  completed_fic_ids?: number[];
  last_saved_fic_entity_id?: number | null;
  last_saved_name?: string;
  last_saved_vat?: string;
  updated_by?: string | null;
}

export type FicImportCheckpointUpdate = Partial<
  Omit<FicImportCheckpointInsert, "entity_kind">
>;

export interface Database {
  public: {
    Tables: {
      fornitori: {
        Row: FornitoreRow;
        Insert: FornitoreInsert;
        Update: FornitoreUpdate;
        Relationships: [];
      };
      catalogo_servizi: {
        Row: CatalogoServizioRow;
        Insert: CatalogoServizioInsert;
        Update: CatalogoServizioUpdate;
        Relationships: [];
      };
      catalogo_prodotti_fornitore: {
        Row: CatalogoProdottoFornitoreRow;
        Insert: CatalogoProdottoFornitoreInsert;
        Update: CatalogoProdottoFornitoreUpdate;
        Relationships: [];
      };
      catalogo_contributi: {
        Row: CatalogoContributoRow;
        Insert: CatalogoContributoInsert;
        Update: CatalogoContributoUpdate;
        Relationships: [];
      };
      clienti: {
        Row: ClienteRow;
        Insert: ClienteInsert;
        Update: ClienteUpdate;
        Relationships: [];
      };
      clienti_archivio: {
        Row: ClienteArchivioRow;
        Insert: ClienteArchivioInsert;
        Update: ClienteArchivioUpdate;
        Relationships: [];
      };
      fornitori_archivio: {
        Row: FornitoreArchivioRow;
        Insert: FornitoreArchivioInsert;
        Update: FornitoreArchivioUpdate;
        Relationships: [];
      };
      materie_prime: {
        Row: MateriaPrimaRow;
        Insert: MateriaPrimaInsert;
        Update: MateriaPrimaUpdate;
        Relationships: [];
      };
      prodotti_propri: {
        Row: ProdottoProprioRow;
        Insert: ProdottoProprioInsert;
        Update: ProdottoProprioUpdate;
        Relationships: [];
      };
      ordini: {
        Row: OrdineRow;
        Insert: OrdineInsert;
        Update: OrdineUpdate;
        Relationships: [];
      };
      ordini_righe: {
        Row: OrdineRigaRow;
        Insert: OrdineRigaInsert;
        Update: Partial<OrdineRigaInsert>;
        Relationships: [];
      };
      imballaggi_voci: {
        Row: ImballaggioVoceRow;
        Insert: ImballaggioVoceInsert;
        Update: ImballaggioVoceUpdate;
        Relationships: [];
      };
      corrieri: {
        Row: CorriereRow;
        Insert: CorriereInsert;
        Update: CorriereUpdate;
        Relationships: [];
      };
      ordini_confezionamento: {
        Row: OrdineConfezionamentoRow;
        Insert: OrdineConfezionamentoInsert;
        Update: Partial<OrdineConfezionamentoInsert> & {
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [];
      };
      ordini_confezionamento_nodi: {
        Row: OrdineConfezionamentoNodoRow;
        Insert: OrdineConfezionamentoNodoInsert;
        Update: Partial<OrdineConfezionamentoNodoInsert> & {
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [];
      };
      produzione_calendario_impegni: {
        Row: ProduzioneCalendarioImpegnoRow;
        Insert: ProduzioneCalendarioImpegnoInsert;
        Update: Partial<ProduzioneCalendarioImpegnoInsert> & {
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [];
      };
      attivita: {
        Row: AttivitaRow;
        Insert: AttivitaInsert;
        Update: AttivitaUpdate;
        Relationships: [];
      };
      attivita_tempo_opzioni: {
        Row: AttivitaTempoOpzioneRow;
        Insert: AttivitaTempoOpzioneInsert;
        Update: Partial<AttivitaTempoOpzioneRow>;
        Relationships: [];
      };
      prodotti_propri_attivita: {
        Row: ProdottoProprioAttivitaRow;
        Insert: {
          id?: string;
          prodotto_id: string;
          attivita_id: string;
          sort_order?: number;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<ProdottoProprioAttivitaRow>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: AuditLogInsert;
        Update: never;
        Relationships: [];
      };
      fatture_emesse: {
        Row: FatturaEmessaRow;
        Insert: FatturaEmessaInsert;
        Update: FatturaEmessaUpdate;
        Relationships: [];
      };
      fatture_emesse_righe: {
        Row: FatturaEmessaRigaRow;
        Insert: FatturaEmessaRigaInsert;
        Update: Partial<FatturaEmessaRigaInsert>;
        Relationships: [];
      };
      fatture_ricevute: {
        Row: FatturaRicevutaRow;
        Insert: FatturaRicevutaInsert;
        Update: FatturaRicevutaUpdate;
        Relationships: [];
      };
      fatture_ricevute_righe: {
        Row: FatturaRicevutaRigaRow;
        Insert: FatturaRicevutaRigaInsert;
        Update: Partial<FatturaRicevutaRigaInsert>;
        Relationships: [];
      };
      fatture_ricevute_codifica_articoli: {
        Row: FatturaRicevutaCodificaArticoloRow;
        Insert: FatturaRicevutaCodificaArticoloInsert;
        Update: never;
        Relationships: [];
      };
      elaborazioni_contabili: {
        Row: ElaborazioneContabileRow;
        Insert: ElaborazioneContabileInsert;
        Update: ElaborazioneContabileUpdate;
        Relationships: [];
      };
      trimestri_commercialista: {
        Row: TrimestreCommercialistaRow;
        Insert: TrimestreCommercialistaInsert;
        Update: TrimestreCommercialistaUpdate;
        Relationships: [];
      };
      elaborazioni_contabili_voci: {
        Row: ElaborazioneContabileVoceRow;
        Insert: ElaborazioneContabileVoceInsert;
        Update: ElaborazioneContabileVoceUpdate;
        Relationships: [];
      };
      fatture_emesse_dilazioni: {
        Row: FatturaEmessaDilazioneRow;
        Insert: FatturaEmessaDilazioneInsert;
        Update: Partial<FatturaEmessaDilazioneInsert>;
        Relationships: [];
      };
      fatture_ricevute_dilazioni: {
        Row: FatturaRicevutaDilazioneRow;
        Insert: FatturaRicevutaDilazioneInsert;
        Update: Partial<FatturaRicevutaDilazioneInsert>;
        Relationships: [];
      };
      fatture_ricevute_contributi_cassa: {
        Row: FatturaRicevutaContributoCassaRow;
        Insert: FatturaRicevutaContributoCassaInsert;
        Update: Partial<FatturaRicevutaContributoCassaInsert>;
        Relationships: [];
      };
      company_fiscal_profile: {
        Row: CompanyFiscalProfileRow;
        Insert: CompanyFiscalProfileInsert;
        Update: CompanyFiscalProfileUpdate;
        Relationships: [];
      };
      company_fiscal_profile_audit: {
        Row: CompanyFiscalProfileAuditRow;
        Insert: CompanyFiscalProfileAuditInsert;
        Update: never;
        Relationships: [];
      };
      fiscal_open_data_cache: {
        Row: FiscalOpenDataCacheRow;
        Insert: Partial<FiscalOpenDataCacheRow> & {
          source_key: string;
        };
        Update: Partial<FiscalOpenDataCacheRow>;
        Relationships: [];
      };
      adempimenti_fiscali: {
        Row: AdempimentoFiscaleRow;
        Insert: AdempimentoFiscaleInsert;
        Update: Partial<AdempimentoFiscaleInsert>;
        Relationships: [];
      };
      dashboard_fiscale_snapshots: {
        Row: DashboardFiscaleSnapshotRow;
        Insert: DashboardFiscaleSnapshotInsert;
        Update: never;
        Relationships: [];
      };
      fic_invoices: {
        Row: FicInvoiceRow;
        Insert: FicInvoiceInsert;
        Update: FicInvoiceUpdate;
        Relationships: [];
      };
      fic_sync_logs: {
        Row: FicSyncLogRow;
        Insert: FicSyncLogInsert;
        Update: FicSyncLogUpdate;
        Relationships: [];
      };
      fic_import_discarded: {
        Row: FicImportDiscardedRow;
        Insert: FicImportDiscardedInsert;
        Update: never;
        Relationships: [];
      };
      fic_import_checkpoints: {
        Row: FicImportCheckpointRow;
        Insert: FicImportCheckpointInsert;
        Update: FicImportCheckpointUpdate;
        Relationships: [];
      };
      user_second_factor: {
        Row: UserSecondFactor;
        Insert: UserSecondFactorInsert;
        Update: UserSecondFactorUpdate;
        Relationships: [];
      };
      auth_sessions_2fa: {
        Row: AuthSession2fa;
        Insert: AuthSession2faInsert;
        Update: AuthSession2faUpdate;
        Relationships: [];
      };
      app_roles: {
        Row: AppRole & { created_at: string };
        Insert: {
          id?: string;
          code: AppRoleCode;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: AppRoleCode;
          name?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      areas: {
        Row: Area & { created_at: string };
        Insert: {
          id?: string;
          slug: AreaSlug;
          name: string;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: AreaSlug;
          name?: string;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: Profile & { created_at: string; updated_at: string };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role_id: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role_id?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "app_roles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_areas: {
        Args: { p_user_id: string };
        Returns: UserArea[];
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_superadmin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      archive_unused_cliente: {
        Args: {
          p_id: string;
          p_motivo: string;
          p_note?: string;
          p_actor?: string;
        };
        Returns: Record<string, unknown>;
      };
      archive_unused_fornitore: {
        Args: {
          p_id: string;
          p_motivo: string;
          p_note?: string;
          p_actor?: string;
        };
        Returns: Record<string, unknown>;
      };
    };
  };
}
