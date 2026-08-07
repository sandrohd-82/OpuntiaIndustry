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
  created_at: string;
  updated_at: string;
}

export interface FornitoreInsert {
  id?: string;
  codice_targa?: string;
  ragione_sociale: string;
  partita_iva: string;
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
  created_at?: string;
  updated_at?: string;
}

export interface FornitoreUpdate {
  id?: string;
  codice_targa?: string;
  ragione_sociale?: string;
  partita_iva?: string;
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
  created_at?: string;
  updated_at?: string;
}

export type ClienteRow = FornitoreRow;
export type ClienteInsert = FornitoreInsert;
export type ClienteUpdate = FornitoreUpdate;

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
  created_at: string;
  updated_at: string;
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
  created_at?: string;
  updated_at?: string;
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
  created_at?: string;
  updated_at?: string;
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
