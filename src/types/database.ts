export type SecondFactorMethod = "email" | "app";

export type AppRoleCode = "admin" | "manager" | "operator" | "viewer";

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

export interface Database {
  public: {
    Tables: {
      auth_sessions_2fa: {
        Row: AuthSession2fa;
        Insert: Partial<AuthSession2fa>;
        Update: Partial<AuthSession2fa>;
      };
      user_second_factor: {
        Row: UserSecondFactor;
        Insert: Partial<UserSecondFactor>;
        Update: Partial<UserSecondFactor>;
      };
      app_roles: {
        Row: AppRole & { created_at: string };
        Insert: Partial<AppRole>;
        Update: Partial<AppRole>;
      };
      areas: {
        Row: Area & { created_at: string };
        Insert: Partial<Area>;
        Update: Partial<Area>;
      };
      profiles: {
        Row: Profile & { created_at: string; updated_at: string };
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
      };
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
    };
  };
}
