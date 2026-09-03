"use client";

import { useCallback, useEffect, useState } from "react";
import {
  canCloseFoglioAction,
  upsertFoglioLavorazioneAction,
} from "@/app/actions/produzione-aree";
import {
  createFoglioLavorazione,
  FOGLI_STORAGE_KEY,
  isFoglioAperto,
  loadFogliFromStorage,
  saveFogliToStorage,
  type CreateFoglioInput,
  type FoglioLavorazione,
} from "@/lib/produzione/fogli-lavorazione";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureUuidId(foglio: FoglioLavorazione): FoglioLavorazione {
  if (UUID_RE.test(foglio.id)) return foglio;
  return {
    ...foglio,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : foglio.id,
  };
}

async function syncFoglioDb(foglio: FoglioLavorazione) {
  if (!UUID_RE.test(foglio.id)) return;
  return upsertFoglioLavorazioneAction({
    id: foglio.id,
    codice: foglio.label,
    descrizione: foglio.descrizione,
    prodotto: foglio.prodotto,
    stato: foglio.stato,
    startedAt: foglio.startedAt,
    expectedEndAt: foglio.expectedEndAt,
    closedAt: foglio.closedAt,
    note: foglio.note,
    motivo: foglio.motivo,
    ordineId: foglio.ordineId,
    ordineLabel: foglio.ordineLabel,
    lottoId: foglio.lottoId,
    lottoLabel: foglio.lottoLabel,
    codiceProdottoUscita: foglio.codiceProdottoUscita,
  });
}

export function useFogliLavorazione() {
  const [fogli, setFogli] = useState<FoglioLavorazione[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    const loaded = loadFogliFromStorage();
    const migrated = loaded.map(ensureUuidId);
    setFogli(migrated);
    if (migrated.some((f, i) => f.id !== loaded[i]?.id)) {
      window.localStorage.setItem(FOGLI_STORAGE_KEY, JSON.stringify(migrated));
      for (const f of migrated) {
        void syncFoglioDb(f);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    function onUpdate() {
      refresh();
    }
    window.addEventListener("opuntia-fogli-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("opuntia-fogli-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [refresh]);

  const persist = useCallback((next: FoglioLavorazione[]) => {
    setFogli(next);
    saveFogliToStorage(next);
  }, []);

  const fogliAperti = fogli.filter(isFoglioAperto);

  async function createFoglio(input: Omit<CreateFoglioInput, "existing">) {
    const foglio = createFoglioLavorazione({ ...input, existing: fogli });
    persist([foglio, ...fogli]);
    const sync = await upsertFoglioLavorazioneAction({
      id: foglio.id,
      codice: foglio.label,
      descrizione: foglio.descrizione,
      prodotto: foglio.prodotto,
      stato: foglio.stato,
      startedAt: foglio.startedAt,
      expectedEndAt: foglio.expectedEndAt,
      closedAt: foglio.closedAt,
      note: foglio.note,
      motivo: foglio.motivo,
      ordineId: foglio.ordineId,
      ordineLabel: foglio.ordineLabel,
      lottoId: foglio.lottoId,
      lottoLabel: foglio.lottoLabel,
      codiceProdottoUscita: foglio.codiceProdottoUscita,
    });
    if (!sync.success) throw new Error(sync.error);
    return foglio;
  }

  async function closeFoglio(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const current = fogli.find((f) => f.id === id);
    if (!current) return { ok: false, error: "Foglio non trovato." };
    const synced = await syncFoglioDb(current);
    if (synced && "success" in synced && synced.success === false) {
      return { ok: false, error: synced.error };
    }
    const check = await canCloseFoglioAction(id);
    if (!check.success) return { ok: false, error: check.error };
    if (!check.ok) {
      return { ok: false, error: check.error ?? "Bilancio di massa non in equilibrio." };
    }
    const now = new Date().toISOString();
    const next = fogli.map((f) =>
      f.id === id ? { ...f, stato: "chiuso" as const, closedAt: now } : f
    );
    persist(next);
    const closed = next.find((f) => f.id === id);
    if (closed) {
      const closeSync = await syncFoglioDb(closed);
      if (closeSync && "success" in closeSync && closeSync.success === false) {
        return { ok: false, error: closeSync.error };
      }
    }
    return { ok: true };
  }

  return {
    fogli,
    fogliAperti,
    ready,
    createFoglio,
    closeFoglio,
    refresh,
  };
}
