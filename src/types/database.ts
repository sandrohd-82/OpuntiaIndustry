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
  | "amministrazione"
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

export interface FornitoreRow {
  id: string;
  codice_targa: string;
  ragione_sociale: string;
  partita_iva: string;
  email: string;
  pec: string;
  sdi_code: string;
  telefono: string;
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
  bio_certificato: string;
  bio_certificato_path: string;
  bio_codice: string;
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
  email?: string;
  pec?: string;
  sdi_code?: string;
  telefono?: string;
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
  bio_certificato?: string;
  bio_certificato_path?: string;
  bio_codice?: string;
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
  email?: string;
  pec?: string;
  sdi_code?: string;
  telefono?: string;
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
  bio_certificato?: string;
  bio_certificato_path?: string;
  bio_codice?: string;
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
  email: string;
  pec: string;
  sdi_code: string;
  telefono: string;
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
  partita_iva: string;
  email?: string;
  pec?: string;
  sdi_code?: string;
  telefono?: string;
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
  email?: string;
  pec?: string;
  sdi_code?: string;
  telefono?: string;
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
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
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
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

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

export interface Database {
  public: {
    Tables: {
      fornitori: {
        Row: FornitoreRow;
        Insert: FornitoreInsert;
        Update: FornitoreUpdate;
        Relationships: [];
      };
      clienti: {
        Row: ClienteRow;
        Insert: ClienteInsert;
        Update: ClienteUpdate;
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
      audit_log: {
        Row: AuditLogRow;
        Insert: AuditLogInsert;
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
    };
  };
}
