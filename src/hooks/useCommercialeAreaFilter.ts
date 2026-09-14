"use client";

import { useEffect, useState } from "react";
import { getCommercialeAnagraficaContextAction } from "@/app/actions/commerciale-anagrafica";
import type { CommercialeAreaOption } from "@/lib/auth/commerciale";

export function useCommercialeAreaFilter() {
  const [showFilter, setShowFilter] = useState(false);
  const [options, setOptions] = useState<CommercialeAreaOption[]>([]);
  const [includeAzienda, setIncludeAzienda] = useState(false);
  const [defaultArea, setDefaultArea] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void getCommercialeAnagraficaContextAction().then((ctx) => {
      setShowFilter(ctx.showAreaFilter);
      setOptions(ctx.areaFilterOptions);
      setIncludeAzienda(ctx.includeAziendaArea);
      setDefaultArea(ctx.defaultAreaFilter);
      setReady(true);
    });
  }, []);

  return { ready, showFilter, options, includeAzienda, defaultArea };
}
