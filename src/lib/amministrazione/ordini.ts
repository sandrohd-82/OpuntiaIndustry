export type OrdineRicevuto = {
  id: string;
  numero: string;
  cliente: string;
  dataOrdine: string;
  importoEuro: number;
  note: string;
  createdAt: string;
};

export const ORDINI_RICEVUTI_STORAGE_KEY = "opuntia.ordini-ricevuti.v1";

export function loadOrdiniRicevuti(): OrdineRicevuto[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDINI_RICEVUTI_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrdineRicevuto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOrdiniRicevuti(ordini: OrdineRicevuto[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ORDINI_RICEVUTI_STORAGE_KEY,
    JSON.stringify(ordini)
  );
  window.dispatchEvent(new Event("opuntia-ordini-ricevuti-updated"));
}

export function createOrdineRicevuto(input: {
  cliente: string;
  dataOrdine: string;
  importoEuro: number;
  note?: string;
  existing: OrdineRicevuto[];
}): OrdineRicevuto {
  const year = new Date().getFullYear();
  const seq =
    input.existing.filter((o) => o.numero.startsWith(`ORD-${year}-`)).length +
    1;
  return {
    id: `ord-${Date.now()}`,
    numero: `ORD-${year}-${String(seq).padStart(3, "0")}`,
    cliente: input.cliente.trim(),
    dataOrdine: input.dataOrdine,
    importoEuro: input.importoEuro,
    note: input.note?.trim() ?? "",
    createdAt: new Date().toISOString(),
  };
}
