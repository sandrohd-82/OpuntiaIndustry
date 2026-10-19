export const KB_ANTICIPI = [
  { id: "", label: "Nessun promemoria" },
  { id: "alla_scadenza", label: "Al momento della scadenza" },
  { id: "15m", label: "15 minuti prima" },
  { id: "1h", label: "1 ora prima" },
  { id: "1d", label: "1 giorno prima" },
  { id: "2d", label: "2 giorni prima" },
] as const;

export const KB_COLORI = [
  { id: "rosso", hex: "#dc2626", nome: "Rosso" },
  { id: "arancio", hex: "#ea580c", nome: "Arancio" },
  { id: "giallo", hex: "#ca8a04", nome: "Giallo" },
  { id: "verde", hex: "#15803d", nome: "Verde" },
  { id: "azzurro", hex: "#0284c7", nome: "Azzurro" },
  { id: "blu", hex: "#1d4ed8", nome: "Blu" },
  { id: "viola", hex: "#7c3aed", nome: "Viola" },
  { id: "rosa", hex: "#db2777", nome: "Rosa" },
  { id: "grigio", hex: "#475569", nome: "Grigio" },
] as const;

export const KB_REAZIONI = ["👍", "✅", "👀", "❤️"] as const;

export type KbOperatore = { id: string; nome: string };

export type KbEtichetta = {
  id: string;
  nome: string;
  colore: string;
};

export type KbVoce = {
  id: string;
  checklistId: string;
  testo: string;
  fatto: boolean;
  scadenzaAt: string | null;
  assegnatoId: string | null;
  sortOrder: number;
};

export type KbChecklist = {
  id: string;
  schedaId: string;
  titolo: string;
  sortOrder: number;
  voci: KbVoce[];
};

export type KbAllegato = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
};

export type KbScheda = {
  id: string;
  listaId: string;
  titolo: string;
  descrizione: string;
  isTemplate: boolean;
  inizioAt: string | null;
  scadenzaAt: string | null;
  scadenzaCompletata: boolean;
  anticipo: string;
  copertinaColore: string;
  copertinaUrl: string;
  sortOrder: number;
  archivedAt: string | null;
  etichettaIds: string[];
  membroIds: string[];
  seguito: boolean;
  checkFatte: number;
  checkTotali: number;
};

export type KbLista = {
  id: string;
  titolo: string;
  sortOrder: number;
  archivedAt: string | null;
};

export type KbBacheca = {
  id: string;
  titolo: string;
  descrizione: string;
  etichetteEstese: boolean;
  archivedAt: string | null;
};

export type KbCommento = {
  id: string;
  testo: string;
  autore: string;
  createdAt: string;
  reazioni: { emoji: string; userId: string }[];
};

export type KbStoricoRiga = {
  id: string;
  summary: string;
  createdAt: string;
};

export type KbBachecaPayload = {
  bacheca: KbBacheca;
  liste: KbLista[];
  schede: KbScheda[];
  etichette: KbEtichetta[];
  checklist: KbChecklist[];
  allegati: Record<string, KbAllegato[]>;
  operatori: KbOperatore[];
  io: string;
};

export function coloreHex(id: string): string {
  return KB_COLORI.find((c) => c.id === id)?.hex ?? "#334155";
}

export function iniziali(nome: string): string {
  const parti = nome.trim().split(/\s+/).filter(Boolean);
  const a = parti[0]?.[0] ?? "?";
  const b = parti[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

export function statoScadenza(
  iso: string | null,
  completata: boolean
): "completata" | "scaduta" | "imminente" | "aperta" | null {
  if (!iso) return null;
  if (completata) return "completata";
  const quando = new Date(iso).getTime();
  if (!Number.isFinite(quando)) return null;
  const ora = Date.now();
  if (quando < ora) return "scaduta";
  if (quando - ora < 24 * 60 * 60 * 1000) return "imminente";
  return "aperta";
}

export function classeScadenza(
  stato: "completata" | "scaduta" | "imminente" | "aperta" | null
): string {
  if (stato === "completata") return "bg-green-100 text-green-800";
  if (stato === "scaduta") return "bg-red-100 text-red-800";
  if (stato === "imminente") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

export function formatQuando(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
