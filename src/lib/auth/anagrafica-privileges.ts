import {
  AZ,
  isPrivilegedActionOn,
  type AnagraficaPrivilegeKind,
} from "@/lib/auth/action-access";
import type { PageAccessMap } from "@/lib/auth/page-access";

export const ANAGRAFICA_ACTION_KEYS: Record<
  AnagraficaPrivilegeKind,
  { timeline: string; modificaAltrui: string; elimina: string }
> = {
  cliente: {
    timeline: AZ.clientiTimeline,
    modificaAltrui: AZ.clientiModificaAltrui,
    elimina: AZ.clientiElimina,
  },
  cliente_possibile: {
    timeline: AZ.possibiliTimeline,
    modificaAltrui: AZ.possibiliModificaAltrui,
    elimina: AZ.possibiliElimina,
  },
  fornitore: {
    timeline: AZ.fornitoriTimeline,
    modificaAltrui: AZ.fornitoriModificaAltrui,
    elimina: AZ.fornitoriElimina,
  },
};

export function kindFromAziendaTipo(
  tipo: string
): AnagraficaPrivilegeKind | null {
  if (tipo === "cliente") return "cliente";
  if (tipo === "cliente_possibile") return "cliente_possibile";
  if (tipo === "fornitore") return "fornitore";
  return null;
}

export function canEditAnagraficaRecord(opts: {
  bypass: boolean;
  userId: string;
  createdBy: string | null | undefined;
  editOthers: boolean;
  treatAsOwn?: boolean;
}): boolean {
  if (opts.bypass) return true;
  if (opts.treatAsOwn) return true;
  if (opts.createdBy && opts.createdBy === opts.userId) return true;
  return opts.editOthers;
}

export function canDeleteAnagraficaRecord(opts: {
  bypass: boolean;
  userId: string;
  createdBy: string | null | undefined;
  canDelete: boolean;
  editOthers: boolean;
  treatAsOwn?: boolean;
}): boolean {
  if (opts.bypass) return true;
  if (!opts.canDelete) return false;
  if (opts.treatAsOwn) return true;
  if (opts.createdBy && opts.createdBy === opts.userId) return true;
  return opts.editOthers;
}

export function evaluateAnagraficaPrivilege(opts: {
  actionAccess: PageAccessMap;
  userId: string;
  kind: AnagraficaPrivilegeKind;
  op: "timeline" | "update" | "delete";
  createdBy?: string | null;
  treatAsOwn?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const keys = ANAGRAFICA_ACTION_KEYS[opts.kind];
  if (opts.op === "timeline") {
    if (isPrivilegedActionOn(opts.actionAccess, keys.timeline)) {
      return { ok: true };
    }
    return {
      ok: false,
      error: "Timeline non autorizzata per questo profilo.",
    };
  }
  if (opts.op === "update") {
    if (
      canEditAnagraficaRecord({
        bypass: false,
        userId: opts.userId,
        createdBy: opts.createdBy,
        treatAsOwn: opts.treatAsOwn,
        editOthers: isPrivilegedActionOn(
          opts.actionAccess,
          keys.modificaAltrui
        ),
      })
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      error: "Non puoi modificare schede create da altri operatori.",
    };
  }
  if (
    canDeleteAnagraficaRecord({
      bypass: false,
      userId: opts.userId,
      createdBy: opts.createdBy,
      treatAsOwn: opts.treatAsOwn,
      canDelete: isPrivilegedActionOn(opts.actionAccess, keys.elimina),
      editOthers: isPrivilegedActionOn(opts.actionAccess, keys.modificaAltrui),
    })
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    error: "Eliminazione non autorizzata per questo profilo.",
  };
}
