import { z } from "zod";

export const topicTitoloSchema = z
  .string()
  .trim()
  .min(1, "Titolo obbligatorio.")
  .max(100, "Il titolo non può superare 100 caratteri.");

export type ChatTopic = {
  id: string;
  titolo: string;
  stato: "attivo" | "archiviato";
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
};

export type TopicMessage = {
  id: string;
  topicId: string;
  senderId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  status: "sent" | "delivered" | "read";
  audioUrl: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileName: string | null;
};

export function mapTopic(row: {
  id: string;
  titolo: string;
  stato: "attivo" | "archiviato";
  created_at: string;
  updated_at: string;
}): ChatTopic {
  return {
    id: row.id,
    titolo: row.titolo,
    stato: row.stato,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTopicMessage(row: {
  id: string;
  topic_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
  status: TopicMessage["status"];
  audio_url: string | null;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
}): TopicMessage {
  return {
    id: row.id,
    topicId: row.topic_id,
    senderId: row.sender_id,
    content: row.content ?? "",
    createdAt: row.created_at,
    isRead: Boolean(row.is_read),
    status: row.status,
    audioUrl: row.audio_url,
    fileUrl: row.file_url,
    fileType: row.file_type,
    fileName: row.file_name,
  };
}
