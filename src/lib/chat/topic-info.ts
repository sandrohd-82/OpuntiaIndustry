import type { ChatMessageKind } from "@/lib/chat/types";
import { schedaEntityLabel } from "@/lib/chat/types";

/** Chiavi stabili per conteggio allegati / messaggi speciali. */
export type TopicAttachmentKind =
  | "image"
  | "video"
  | "pdf"
  | "document"
  | "audio"
  | "location"
  | "contact"
  | "poll"
  | "scheda"
  | "scheda_cliente"
  | "scheda_possibile_cliente"
  | "scheda_fornitore"
  | "scheda_prodotto"
  | "scheda_prodotto_agri"
  | "scheda_materia_prima";

export const TOPIC_ATTACHMENT_LABELS: Record<TopicAttachmentKind, string> = {
  image: "Immagini",
  video: "Video",
  pdf: "PDF",
  document: "Documenti",
  audio: "Note vocali",
  location: "Posizioni",
  contact: "Contatti",
  poll: "Sondaggi",
  scheda: "Schede",
  scheda_cliente: "Scheda cliente",
  scheda_possibile_cliente: "Scheda possibile cliente",
  scheda_fornitore: "Scheda fornitore",
  scheda_prodotto: "Scheda prodotto acquistato",
  scheda_prodotto_agri: "Scheda prodotto Agrinsicilia",
  scheda_materia_prima: "Scheda materia prima",
};

type MsgLite = {
  message_kind?: string | null;
  file_type?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  audio_url?: string | null;
  payload?: Record<string, unknown> | null;
};

/**
 * Classifica un messaggio in un tipo allegato “visibile” in info gruppo.
 * Testo puro → null (conta solo in NumMess).
 */
export function classifyTopicAttachment(
  row: MsgLite
): TopicAttachmentKind | null {
  const kind = String(row.message_kind ?? "text") as ChatMessageKind;
  const ft = (row.file_type ?? "").toLowerCase();
  const fn = (row.file_name ?? "").toLowerCase();

  if (kind === "location") return "location";
  if (kind === "contact") return "contact";
  if (kind === "poll") return "poll";
  if (kind === "scheda") {
    const et = String(row.payload?.entityType ?? "");
    if (et === "cliente") return "scheda_cliente";
    if (et === "possibile_cliente") return "scheda_possibile_cliente";
    if (et === "fornitore") return "scheda_fornitore";
    if (et === "prodotto") return "scheda_prodotto";
    if (et === "prodotto_agri") return "scheda_prodotto_agri";
    if (et === "materia_prima") return "scheda_materia_prima";
    return "scheda";
  }
  if (kind === "audio" || row.audio_url) return "audio";
  if (kind === "file" || row.file_url) {
    if (ft.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/i.test(fn)) {
      return "image";
    }
    if (ft.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(fn)) {
      return "video";
    }
    if (ft.includes("pdf") || fn.endsWith(".pdf")) return "pdf";
    return "document";
  }
  return null;
}

export function attachmentLabel(kind: TopicAttachmentKind): string {
  if (kind.startsWith("scheda_") && kind !== "scheda") {
    const et = kind.replace("scheda_", "");
    const named = schedaEntityLabel[et];
    if (named) return `Scheda ${named.toLowerCase()}`;
  }
  return TOPIC_ATTACHMENT_LABELS[kind];
}

export function countsToSortedList(
  counts: Map<TopicAttachmentKind, number>
): Array<{ kind: TopicAttachmentKind; label: string; count: number }> {
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .map(([kind, count]) => ({
      kind,
      label: attachmentLabel(kind),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "it"));
}
