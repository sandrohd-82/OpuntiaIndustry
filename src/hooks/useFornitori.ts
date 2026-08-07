"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createFornitoreAction,
  listFornitoriAction,
  updateFornitoreAction,
} from "@/app/actions/fornitori";
import type { Fornitore, FornitoreInput } from "@/lib/amministrazione/fornitori";

function toFormData(input: FornitoreInput, bioPdf?: File | null) {
  const fd = new FormData();
  fd.set("input", JSON.stringify(input));
  if (bioPdf) fd.set("bioPdf", bioPdf);
  return fd;
}

export function useFornitori() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listFornitoriAction();
    if (result.success) {
      setFornitori(result.fornitori);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  async function addFornitore(input: FornitoreInput, bioPdf?: File | null) {
    const result = await createFornitoreAction(toFormData(input, bioPdf));
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setFornitori((prev) => [result.fornitore, ...prev]);
    setError(null);
    return result.fornitore;
  }

  async function updateFornitore(
    id: string,
    input: FornitoreInput,
    bioPdf?: File | null
  ) {
    const result = await updateFornitoreAction(id, toFormData(input, bioPdf));
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setFornitori((prev) =>
      prev.map((item) => (item.id === id ? result.fornitore : item))
    );
    setError(null);
    return result.fornitore;
  }

  return { fornitori, ready, error, addFornitore, updateFornitore, refresh };
}
