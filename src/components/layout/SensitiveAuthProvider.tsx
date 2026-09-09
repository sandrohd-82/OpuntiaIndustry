"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  EMPTY_AUTH_SETTINGS,
  type DataScopeMap,
  type ProfileAuthSettings,
} from "@/lib/auth/data-scope";

export type SensitiveAuthValue = ProfileAuthSettings & {
  canElaboraContabilita: boolean;
};

const EMPTY: SensitiveAuthValue = {
  ...EMPTY_AUTH_SETTINGS,
  canElaboraContabilita: false,
};

const Ctx = createContext<SensitiveAuthValue>(EMPTY);

export function SensitiveAuthProvider({
  settings,
  canElaboraContabilita = false,
  children,
}: {
  settings: ProfileAuthSettings;
  canElaboraContabilita?: boolean;
  children: ReactNode;
}) {
  return (
    <Ctx.Provider value={{ ...settings, canElaboraContabilita }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSensitiveAuth(): SensitiveAuthValue {
  return useContext(Ctx);
}

export type AuthzModalState = {
  settings: ProfileAuthSettings;
  scopes: DataScopeMap;
};
