"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  isActionAllowed,
  isPrivilegedActionOn,
  type AnagraficaPrivilegeKind,
} from "@/lib/auth/action-access";
import {
  ANAGRAFICA_ACTION_KEYS,
  canDeleteAnagraficaRecord,
  canEditAnagraficaRecord,
  canViewAnagraficaTimeline,
} from "@/lib/auth/anagrafica-privileges";
import type { PageAccessMap } from "@/lib/auth/page-access";

type Ctx = {
  actionAccess: PageAccessMap;
  testMenuMode: boolean;
  userId: string;
  bypassPrivileges: boolean;
  allowed: (actionKey: string) => boolean;
  privilegedAllowed: (actionKey: string) => boolean;
};

const ActionAccessContext = createContext<Ctx>({
  actionAccess: {},
  testMenuMode: false,
  userId: "",
  bypassPrivileges: false,
  allowed: () => true,
  privilegedAllowed: () => false,
});

export function ActionAccessProvider({
  actionAccess,
  testMenuMode,
  userId,
  bypassPrivileges = false,
  children,
}: {
  actionAccess: PageAccessMap;
  testMenuMode: boolean;
  userId: string;
  bypassPrivileges?: boolean;
  children: ReactNode;
}) {
  return (
    <ActionAccessContext.Provider
      value={{
        actionAccess,
        testMenuMode,
        userId,
        bypassPrivileges,
        allowed: (key) =>
          testMenuMode ? true : isActionAllowed(actionAccess, key),
        privilegedAllowed: (key) =>
          bypassPrivileges || isPrivilegedActionOn(actionAccess, key),
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

export function useAnagraficaPrivileges(kind: AnagraficaPrivilegeKind) {
  const { privilegedAllowed, userId, bypassPrivileges } = useActionAccess();
  const keys = ANAGRAFICA_ACTION_KEYS[kind];
  return {
    userId,
    canTimeline: privilegedAllowed(keys.timeline),
    canTimelineRecord: (treatAsOwn = false) =>
      canViewAnagraficaTimeline({
        bypass: bypassPrivileges,
        treatAsOwn,
        showOthers: privilegedAllowed(keys.timeline),
      }),
    canEdit: (
      createdBy: string | null | undefined,
      treatAsOwn = false
    ) =>
      canEditAnagraficaRecord({
        bypass: bypassPrivileges,
        userId,
        createdBy,
        treatAsOwn,
        editOthers: privilegedAllowed(keys.modificaAltrui),
      }),
    canDelete: (
      createdBy: string | null | undefined,
      treatAsOwn = false
    ) =>
      canDeleteAnagraficaRecord({
        bypass: bypassPrivileges,
        userId,
        createdBy,
        treatAsOwn,
        canDelete: privilegedAllowed(keys.elimina),
        editOthers: privilegedAllowed(keys.modificaAltrui),
      }),
  };
}
