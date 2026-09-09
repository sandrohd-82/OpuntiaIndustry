"use client";

import { createContext, useContext, type ReactNode } from "react";
import { isActionAllowed } from "@/lib/auth/action-access";
import type { PageAccessMap } from "@/lib/auth/page-access";

type Ctx = {
  actionAccess: PageAccessMap;
  testMenuMode: boolean;
  allowed: (actionKey: string) => boolean;
};

const ActionAccessContext = createContext<Ctx>({
  actionAccess: {},
  testMenuMode: false,
  allowed: () => true,
});

export function ActionAccessProvider({
  actionAccess,
  testMenuMode,
  children,
}: {
  actionAccess: PageAccessMap;
  testMenuMode: boolean;
  children: ReactNode;
}) {
  return (
    <ActionAccessContext.Provider
      value={{
        actionAccess,
        testMenuMode,
        allowed: (key) =>
          testMenuMode ? true : isActionAllowed(actionAccess, key),
      }}
    >
      {children}
    </ActionAccessContext.Provider>
  );
}

export function useActionAccess() {
  return useContext(ActionAccessContext);
}

export function ActionGate({
  actionKey,
  children,
}: {
  actionKey: string;
  children: ReactNode;
}) {
  const { allowed } = useActionAccess();
  if (!allowed(actionKey)) return null;
  return children;
}
