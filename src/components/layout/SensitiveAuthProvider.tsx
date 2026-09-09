"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  EMPTY_AUTH_SETTINGS,
  type DataScopeMap,
  type ProfileAuthSettings,
} from "@/lib/auth/data-scope";

const Ctx = createContext<ProfileAuthSettings>(EMPTY_AUTH_SETTINGS);

export function SensitiveAuthProvider({
  settings,
  children,
}: {
  settings: ProfileAuthSettings;
  children: ReactNode;
}) {
  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}

export function useSensitiveAuth(): ProfileAuthSettings {
  return useContext(Ctx);
}

export type AuthzModalState = {
  settings: ProfileAuthSettings;
  scopes: DataScopeMap;
};
