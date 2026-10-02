import { roundMoney } from "@/lib/amministrazione/fatture";

export type LatoElenco = "emesso" | "ricevuto";

export type TipoDocElenco = "fattura" | "ddt" | "nota";

export type DocElencoGrezzo = {
  id: string;
  tipo: TipoDocElenco;
  numero: string;
  data: string;
  intestazione: string;
  /** Stessa controparte: id anagrafica oppure nome normalizzato. Vuoto = non collegabile. */
  chiave: string;
  nomeChiave: string;
  imponibile: number;
  iva: number;
  totale: number;
  /** Fattura a cui la nota o il DDT è agganciato, se è nel periodo. */
  padreId: string | null;
  /** Numero del documento collegato anche se cade fuori dal periodo. */
  padreNumero: string;
};

export type RigaElencoMisto = {
  tipoRiga: "documento" | "mese" | "generale";
  sequenza: number | null;
  gruppo: number | null;
  tipo: string;
  numero: string;
  data: string;
  intestazione: string;
  collegatoA: string;
  imponibile: number;
  iva: number;
  totale: number;
  notaCredito: boolean;
  ddt: boolean;
};

const TIPO_RANK: Record<TipoDocElenco, number> = {
  ddt: 0,
  fattura: 1,
  nota: 2,
};

const TIPO_LABEL: Record<TipoDocElenco, string> = {
  fattura: "Fattura",
  ddt: "DDT",
  nota: "Nota di credito",
};

const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

function stessaControparte(a: DocElencoGrezzo, b: DocElencoGrezzo): boolean {
  if (a.chiave && a.chiave === b.chiave) return true;
  return a.nomeChiave.length >= 4 && a.nomeChiave === b.nomeChiave;
}

function giorniTra(dopo: string, prima: string): number {
  const a = Date.parse(`${dopo.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${prima.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 9999;
  return Math.round((a - b) / 86400000);
}

function etichettaTipo(tipo: TipoDocElenco): string {
  return TIPO_LABEL[tipo];
}

/**
 * Unisce fatture, DDT e note di credito.
 * Il gruppo sta sulla data della fattura (o sulla data del documento se è solo).
 * Dentro il gruppo: data, e a parità DDT poi fattura poi nota.
 * Il DDT si aggancia alla fattura della stessa controparte nei 120 giorni successivi.
 * La nota senza id collegato si aggancia alla fattura dello stesso importo nei 180 giorni precedenti.
 */
export function incastraDocumenti(docs: DocElencoGrezzo[]): RigaElencoMisto[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const padre = new Map<string, string>();

  for (const doc of docs) {
    if (doc.padreId && byId.has(doc.padreId) && doc.padreId !== doc.id) {
      padre.set(doc.id, doc.padreId);
    }
  }

  const fatture = docs.filter((d) => d.tipo === "fattura");

  for (const ddt of docs) {
    if (ddt.tipo !== "ddt" || padre.has(ddt.id)) continue;
    const vicino = fatture
      .filter((f) => stessaControparte(ddt, f))
      .map((f) => ({ f, delta: giorniTra(f.data, ddt.data) }))
      .filter((x) => x.delta >= 0 && x.delta <= 120)
      .sort((a, b) => a.delta - b.delta)[0];
    if (vicino) padre.set(ddt.id, vicino.f.id);
  }

  for (const nota of docs) {
    if (nota.tipo !== "nota" || padre.has(nota.id)) continue;
    const abs = Math.abs(nota.totale);
    const vicino = fatture
      .filter((f) => stessaControparte(nota, f))
      .map((f) => ({
        f,
        delta: giorniTra(nota.data, f.data),
        scarto: Math.abs(Math.abs(f.totale) - abs),
      }))
      .filter(
        (x) =>
          x.delta >= 0 &&
          x.delta <= 180 &&
          (abs === 0 || x.scarto <= Math.max(1, abs * 0.02))
      )
      .sort((a, b) => a.delta - b.delta || a.scarto - b.scarto)[0];
    if (vicino) padre.set(nota.id, vicino.f.id);
  }

  function radice(id: string): string {
    let cur = id;
    const visti = new Set<string>();
    while (padre.has(cur) && !visti.has(cur)) {
      visti.add(cur);
      cur = padre.get(cur) ?? cur;
    }
    return cur;
  }

  const gruppi = new Map<string, DocElencoGrezzo[]>();
  for (const doc of docs) {
    const id = radice(doc.id);
    const lista = gruppi.get(id) ?? [];
    lista.push(doc);
    gruppi.set(id, lista);
  }

  function ancora(gruppo: DocElencoGrezzo[]): string {
    const fattura = gruppo.find((d) => d.tipo === "fattura");
    if (fattura) return fattura.data;
    return gruppo.map((d) => d.data).sort()[0] ?? "";
  }

  const ordinati = [...gruppi.values()].sort((a, b) => {
    const da = ancora(a);
    const db = ancora(b);
    if (da !== db) return da < db ? -1 : 1;
    const na = a.find((d) => d.tipo === "fattura")?.numero ?? a[0]?.numero ?? "";
    const nb = b.find((d) => d.tipo === "fattura")?.numero ?? b[0]?.numero ?? "";
    return na.localeCompare(nb, "it");
  });

  const documenti: RigaElencoMisto[] = [];
  let sequenza = 0;
  ordinati.forEach((gruppo, index) => {
    const interno = [...gruppo].sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      if (TIPO_RANK[a.tipo] !== TIPO_RANK[b.tipo]) {
        return TIPO_RANK[a.tipo] - TIPO_RANK[b.tipo];
      }
      return a.numero.localeCompare(b.numero, "it");
    });
    for (const doc of interno) {
      sequenza += 1;
      const idPadre = padre.get(doc.id);
      const docPadre = idPadre ? byId.get(idPadre) : undefined;
      const collegatoA = docPadre
        ? `${etichettaTipo(docPadre.tipo)} ${docPadre.numero}`
        : doc.padreNumero;
      documenti.push({
        tipoRiga: "documento",
        sequenza,
        gruppo: index + 1,
        tipo: etichettaTipo(doc.tipo),
        numero: doc.numero,
        data: doc.data.slice(0, 10),
        intestazione: doc.intestazione,
        collegatoA,
        imponibile: roundMoney(doc.imponibile),
        iva: roundMoney(doc.iva),
        totale: roundMoney(doc.totale),
        notaCredito: doc.tipo === "nota",
        ddt: doc.tipo === "ddt",
      });
    }
  });

  return [...documenti, ...totaliPerMese(documenti)];
}

function totaliPerMese(documenti: RigaElencoMisto[]): RigaElencoMisto[] {
  const mesi = new Map<string, { imponibile: number; iva: number; totale: number }>();
  for (const doc of documenti) {
    const chiave = doc.data.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(chiave)) continue;
    const cur = mesi.get(chiave) ?? { imponibile: 0, iva: 0, totale: 0 };
    cur.imponibile += doc.imponibile;
    cur.iva += doc.iva;
    cur.totale += doc.totale;
    mesi.set(chiave, cur);
  }
  const righe: RigaElencoMisto[] = [];
  let imponibile = 0;
  let iva = 0;
  let totale = 0;
  for (const chiave of [...mesi.keys()].sort()) {
    const tot = mesi.get(chiave);
    if (!tot) continue;
    const [anno, mese] = chiave.split("-");
    const nome = MESI[Number(mese) - 1] ?? mese;
    righe.push(rigaTotale(`Totale ${nome} ${anno}`, tot));
    imponibile += tot.imponibile;
    iva += tot.iva;
    totale += tot.totale;
  }
  righe.push(
    rigaTotale("Totale generale", {
      imponibile: roundMoney(imponibile),
      iva: roundMoney(iva),
      totale: roundMoney(totale),
    }, true)
  );
  return righe;
}

function rigaTotale(
  etichetta: string,
  tot: { imponibile: number; iva: number; totale: number },
  generale = false
): RigaElencoMisto {
  return {
    tipoRiga: generale ? "generale" : "mese",
    sequenza: null,
    gruppo: null,
    tipo: "",
    numero: "",
    data: "",
    intestazione: etichetta,
    collegatoA: "",
    imponibile: roundMoney(tot.imponibile),
    iva: roundMoney(tot.iva),
    totale: roundMoney(tot.totale),
    notaCredito: false,
    ddt: false,
  };
}

export function dataElencoIt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso ? iso : "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function nomeChiaveControparte(nome: string): string {
  return nome.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function chiaveControparte(id: string | null | undefined, nome: string): string {
  const anagrafica = (id ?? "").trim();
  if (anagrafica) return `id:${anagrafica}`;
  const n = nomeChiaveControparte(nome);
  return n.length >= 4 ? `nome:${n}` : "";
}
