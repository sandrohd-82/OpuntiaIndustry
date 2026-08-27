import type { SupabaseClient } from "@supabase/supabase-js";
import { insertChatMessageAndNotify } from "@/lib/chat/messages";
import { insertTopicMessage } from "@/lib/chat/topic-api";
import type { ChatMessage } from "@/lib/chat/types";
import type { TopicMessage } from "@/lib/chat/topics";

const VOICE_BUCKET = "voice_notes";
const MEDIA_BUCKET = "chat_media";

function publicUrl(supabase: SupabaseClient, bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function sendVoiceMessage(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  blob: Blob,
  filename = `voice-${Date.now()}.webm`
): Promise<ChatMessage> {
  if (blob.size > 5 * 1024 * 1024) {
    throw new Error("Nota vocale troppo grande (max 5 MB).");
  }
  const path = `${userId}/${conversationId}/${filename}`;
  const { error: upErr } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || "audio/webm",
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);
  const url = publicUrl(supabase, VOICE_BUCKET, path);
  return insertChatMessageAndNotify(supabase, userId, {
    conversationId,
    content: "",
    audioUrl: url,
  });
}

export async function sendTopicVoiceMessage(
  supabase: SupabaseClient,
  userId: string,
  topicId: string,
  blob: Blob,
  filename = `voice-${Date.now()}.webm`
): Promise<TopicMessage> {
  if (blob.size > 5 * 1024 * 1024) {
    throw new Error("Nota vocale troppo grande (max 5 MB).");
  }
  const path = `${userId}/${topicId}/${filename}`;
  const { error: upErr } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || "audio/webm",
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);
  const url = publicUrl(supabase, VOICE_BUCKET, path);
  return insertTopicMessage(supabase, userId, topicId, {
    content: "",
    audioUrl: url,
    messageKind: "audio",
  });
}

export async function sendChatAttachment(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  file: File
): Promise<ChatMessage> {
  const isVideo = (file.type || "").toLowerCase().startsWith("video/");
  const maxBytes = isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      isVideo
        ? "Video troppo grande (max 25 MB)."
        : "Allegato troppo grande (max 10 MB)."
    );
  }
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${userId}/${conversationId}/${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);
  const url = publicUrl(supabase, MEDIA_BUCKET, path);
  return insertChatMessageAndNotify(supabase, userId, {
    conversationId,
    content: "",
    fileUrl: url,
    fileType: file.type || "application/octet-stream",
    fileName: file.name,
  });
}

export async function sendTopicAttachment(
  supabase: SupabaseClient,
  userId: string,
  topicId: string,
  file: File
): Promise<TopicMessage> {
  const isVideo = (file.type || "").toLowerCase().startsWith("video/");
  const maxBytes = isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      isVideo
        ? "Video troppo grande (max 25 MB)."
        : "Allegato troppo grande (max 10 MB)."
    );
  }
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${userId}/${topicId}/${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);
  const url = publicUrl(supabase, MEDIA_BUCKET, path);
  return insertTopicMessage(supabase, userId, topicId, {
    content: "",
    fileUrl: url,
    fileType: file.type || "application/octet-stream",
    fileName: file.name,
    messageKind: "file",
  });
}

/** True se il messaggio richiede / ha pipeline STT (vocale o video). */
export function isChatTranscribableMessage(msg: {
  audioUrl?: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
}): boolean {
  if (msg.audioUrl) return true;
  const ft = (msg.fileType ?? "").toLowerCase();
  return Boolean(msg.fileUrl && ft.startsWith("video/"));
}
