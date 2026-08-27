import { z } from "zod";

export type MessageStatus = "sent" | "delivered" | "read";
export type PeerKind = "customer" | "producer";
export type ChatStatus = "available" | "away" | "offline";
export type ChatMessageKind =
  | "text"
  | "audio"
  | "file"
  | "location"
  | "contact"
  | "poll"
  | "scheda";

export type Conversation = {
  id: string;
  customerId: string;
  producerId: string;
  listingId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptStatus = "pending" | "done" | "error";

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  status: MessageStatus;
  messageKind: ChatMessageKind;
  payload: Record<string, unknown>;
  audioUrl: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileName: string | null;
  transcriptText: string | null;
  transcriptStatus: TranscriptStatus | null;
  transcriptAt: string | null;
  transcriptBy: string | null;
  transcriptModel: string | null;
  transcriptError: string | null;
};

export type ChatContact = {
  id: string;
  ownerId: string;
  peerId: string;
  peerKind: PeerKind;
  lastInteractionAt: string;
  peerName?: string;
  peerEmail?: string;
  peerChatStatus?: ChatStatus;
};

export type ConversationListItem = Conversation & {
  peerId: string;
  peerName: string;
  peerEmail: string;
  peerChatStatus: ChatStatus;
  lastMessage: string | null;
  unreadCount: number;
};

export const MESSAGE_SELECT =
  "id, conversation_id, sender_id, content, created_at, is_read, status, message_kind, payload, audio_url, file_url, file_type, file_name, transcript_text, transcript_status, transcript_at, transcript_by, transcript_model, transcript_error";

function parseKind(raw: unknown): ChatMessageKind {
  const k = String(raw ?? "text");
  if (
    k === "text" ||
    k === "audio" ||
    k === "file" ||
    k === "location" ||
    k === "contact" ||
    k === "poll" ||
    k === "scheda"
  ) {
    return k;
  }
  return "text";
}

export function mapConversation(row: {
  id: string;
  customer_id: string;
  producer_id: string;
  listing_id: string | null;
  created_at: string;
  updated_at: string;
}): Conversation {
  return {
    id: row.id,
    customerId: row.customer_id,
    producerId: row.producer_id,
    listingId: row.listing_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMessage(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
  status: MessageStatus;
  message_kind?: string | null;
  payload?: Record<string, unknown> | null;
  audio_url: string | null;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
  transcript_text?: string | null;
  transcript_status?: string | null;
  transcript_at?: string | null;
  transcript_by?: string | null;
  transcript_model?: string | null;
  transcript_error?: string | null;
}): ChatMessage {
  const ts = row.transcript_status;
  const transcriptStatus =
    ts === "pending" || ts === "done" || ts === "error" ? ts : null;
  let kind = parseKind(row.message_kind);
  if (kind === "text" && row.audio_url) kind = "audio";
  if (kind === "text" && row.file_url) kind = "file";
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content ?? "",
    createdAt: row.created_at,
    isRead: Boolean(row.is_read),
    status: row.status,
    messageKind: kind,
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? row.payload
        : {},
    audioUrl: row.audio_url,
    fileUrl: row.file_url,
    fileType: row.file_type,
    fileName: row.file_name,
    transcriptText: row.transcript_text ?? null,
    transcriptStatus,
    transcriptAt: row.transcript_at ?? null,
    transcriptBy: row.transcript_by ?? null,
    transcriptModel: row.transcript_model ?? null,
    transcriptError: row.transcript_error ?? null,
  };
}

export function peerIdOf(c: Conversation, viewerId: string): string {
  return c.customerId === viewerId ? c.producerId : c.customerId;
}

export const schedaEntityLabel: Record<string, string> = {
  cliente: "Cliente",
  possibile_cliente: "Possibile cliente",
  fornitore: "Fornitore",
  prodotto: "Prodotto",
  prodotto_agri: "Prodotto Agrinsicilia",
  materia_prima: "Materia prima",
};

export const chatVoteSchema = z.object({
  pollId: z.string().uuid(),
  optionId: z.string().uuid(),
});
