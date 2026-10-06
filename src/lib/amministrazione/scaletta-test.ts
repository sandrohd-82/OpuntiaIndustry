import type {
  ScalettaImpegno,
  ScalettaTipoImpegno,
} from "@/lib/amministrazione/scaletta-produzione";

/** Stato di prova: vive solo in memoria e si azzera al ricaricamento. */
export type ScalettaTestStato =
  | "da_prendere"
  | "non_rilasciata"
  | "attesa"
  | "in_esecuzione"
  | "completata";

export const SCALETTA_TEST_STATO_LABEL: Record<ScalettaTestStato, string> = {
  da_prendere: "Da prendere in carico",
  non_rilasciata: "In attesa della lavorazione",
  attesa: "Attesa presa in carico",
  in_esecuzione: "In esecuzione",
  completata: "Completata",
};

export type ScalettaTestNodo = {
  id: string;
  codice: string;
  tipo: ScalettaTipoImpegno;
  ruolo: "madre" | "figlio";
  impegno: ScalettaImpegno | null;
  processoCodice: string;
  titolo: string;
  numeroInterno: string;
  cliente: string;
  prodotto: string;
  dataGiorno: string;
};

export type ScalettaTestGruppo = {
  key: string;
  dataGiorno: string;
  codice: string;
  madre: ScalettaTestNodo;
  figli: ScalettaTestNodo[];
};

function padCodice(n: number): string {
  return `LW-${String(n).padStart(4, "0")}`;
}

function sortImpegni(items: ScalettaImpegno[]): ScalettaImpegno[] {
  return [...items].sort((a, b) => {
    const day = a.dataGiorno.localeCompare(b.dataGiorno);
    if (day !== 0) return day;
    return a.etichetta.localeCompare(b.etichetta, "it");
  });
}

export function buildScalettaTestGruppi(
  impegni: ScalettaImpegno[]
): ScalettaTestGruppo[] {
  const buckets = new Map<string, ScalettaImpegno[]>();
  for (const item of impegni) {
    const key = `${item.entityType}:${item.entityId || item.id}`;
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  const bozze: Array<Omit<ScalettaTestGruppo, "codice"> & { ordine: string }> =
    [];
  for (const [key, raw] of buckets) {
    const items = sortImpegni(raw);
    const lavorazioni = items.filter((i) => i.tipo === "lavorazione");
    const trasformazioni = items.filter((i) => i.tipo === "trasformazione");
    const confezionamenti = items.filter((i) => i.tipo === "confezionamento");
    const altri = items.filter(
      (i) =>
        i.tipo !== "lavorazione" &&
        i.tipo !== "trasformazione" &&
        i.tipo !== "confezionamento"
    );
    const madreSrc = lavorazioni[0] ?? null;
    const extraLavorazioni = lavorazioni.slice(1);
    const dataGiorno =
      madreSrc?.dataGiorno ??
      items.map((i) => i.dataGiorno).sort()[0] ??
      "";
    const campione = madreSrc ?? items[0];
    if (!campione) continue;
    const madre: ScalettaTestNodo = {
      id: madreSrc?.id ?? `sint:${key}`,
      codice: "",
      tipo: "lavorazione",
      ruolo: "madre",
      impegno: madreSrc,
      processoCodice: madreSrc?.processoCodice ?? "",
      titolo: madreSrc?.etichetta || "Lavorazione",
      numeroInterno: campione.numeroInterno,
      cliente: campione.cliente,
      prodotto: campione.prodotto,
      dataGiorno,
    };
    const figliSrc = [
      ...trasformazioni,
      ...confezionamenti,
      ...extraLavorazioni,
      ...altri,
    ];
    const figli: ScalettaTestNodo[] = figliSrc.map((item) => ({
      id: item.id,
      codice: "",
      tipo: item.tipo,
      ruolo: "figlio",
      impegno: item,
      processoCodice: item.processoCodice,
      titolo: item.etichetta,
      numeroInterno: item.numeroInterno,
      cliente: item.cliente,
      prodotto: item.prodotto,
      dataGiorno: item.dataGiorno,
    }));
    bozze.push({
      key,
      dataGiorno,
      madre,
      figli,
      ordine: `${dataGiorno}|${campione.numeroInterno}|${key}`,
    });
  }

  bozze.sort((a, b) => a.ordine.localeCompare(b.ordine, "it"));
  return bozze.map((gruppo, index) => {
    const codice = padCodice(index + 1);
    let trasformazione = 0;
    let confezionamento = 0;
    return {
      key: gruppo.key,
      dataGiorno: gruppo.dataGiorno,
      codice,
      madre: { ...gruppo.madre, codice },
      figli: gruppo.figli.map((figlio) => {
        if (figlio.tipo === "trasformazione") {
          trasformazione += 1;
          return { ...figlio, codice: `${codice}-T${trasformazione}` };
        }
        if (figlio.tipo === "confezionamento") {
          confezionamento += 1;
          return { ...figlio, codice: `${codice}-C${confezionamento}` };
        }
        return { ...figlio, codice: `${codice}-A${figlio.id.slice(0, 4)}` };
      }),
    };
  });
}

export function statoInizialeNodo(nodo: ScalettaTestNodo): ScalettaTestStato {
  return nodo.ruolo === "madre" ? "da_prendere" : "non_rilasciata";
}

export function prendiInCarico(
  stati: Record<string, ScalettaTestStato>,
  gruppo: ScalettaTestGruppo,
  nodoId: string
): Record<string, ScalettaTestStato> {
  const next = { ...stati };
  if (nodoId === gruppo.madre.id) {
    next[gruppo.madre.id] = "in_esecuzione";
    for (const figlio of gruppo.figli) {
      const attuale = next[figlio.id] ?? statoInizialeNodo(figlio);
      if (attuale === "non_rilasciata" || attuale === "da_prendere") {
        next[figlio.id] = "attesa";
      }
    }
    return next;
  }
  const figlio = gruppo.figli.find((item) => item.id === nodoId);
  if (!figlio) return next;
  const madreStato = next[gruppo.madre.id] ?? statoInizialeNodo(gruppo.madre);
  if (madreStato !== "in_esecuzione" && madreStato !== "completata") return next;
  next[figlio.id] = "in_esecuzione";
  return next;
}

export function dichiaraCompleta(
  stati: Record<string, ScalettaTestStato>,
  gruppo: ScalettaTestGruppo,
  nodoId: string
): Record<string, ScalettaTestStato> | null {
  const attuale = stati[nodoId] ?? statoInizialeNodo(
    nodoId === gruppo.madre.id
      ? gruppo.madre
      : gruppo.figli.find((item) => item.id === nodoId) ?? gruppo.madre
  );
  if (attuale !== "in_esecuzione") return null;
  if (nodoId === gruppo.madre.id && !madreCompletabile(stati, gruppo)) {
    return null;
  }
  return { ...stati, [nodoId]: "completata" };
}

export function madreCompletabile(
  stati: Record<string, ScalettaTestStato>,
  gruppo: ScalettaTestGruppo
): boolean {
  const richiesti = gruppo.figli.filter(
    (figlio) =>
      figlio.tipo === "trasformazione" || figlio.tipo === "confezionamento"
  );
  if (!richiesti.length) return false;
  return richiesti.every(
    (figlio) => (stati[figlio.id] ?? statoInizialeNodo(figlio)) === "completata"
  );
}

export function giorniToccati(gruppo: ScalettaTestGruppo): string[] {
  return [
    ...new Set(
      [gruppo.dataGiorno, ...gruppo.figli.map((figlio) => figlio.dataGiorno)].filter(
        Boolean
      )
    ),
  ];
}

export function gruppoVisibile(
  gruppo: ScalettaTestGruppo,
  needle: string,
  tipo: ScalettaTipoImpegno | "tutte"
): boolean {
  const nodi = [gruppo.madre, ...gruppo.figli];
  if (tipo !== "tutte" && !nodi.some((nodo) => nodo.tipo === tipo)) {
    return false;
  }
  if (!needle) return true;
  return nodi.some((nodo) => {
    const blob = [
      nodo.codice,
      nodo.titolo,
      nodo.numeroInterno,
      nodo.cliente,
      nodo.prodotto,
      nodo.processoCodice,
    ]
      .join(" ")
      .toLowerCase();
    return blob.includes(needle);
  });
}
