"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { MESSAGE_SELECT, mapMessage, type ChatMessage } from "@/lib/chat/types";
import { recordDecision } from "@/lib/learning/decision-events";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const WHISPER_MODEL = process.env.CHAT_TRANSCRIBE_MODEL?.trim() || "whisper-1";

const schema = z.object({
  messageId: z.string().uuid(),
});

type MediaSource = {
  url: string;
  kind: "audio" | "video";
  filename: string;
  contentType: string;
};

function guessFilename(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").pop() || fallback;
    return base.includes(".") ? base : fallback;
  } catch {
    return fallback;
  }
}

function resolveMediaSource(row: {
  audio_url?: string | null;
  file_url?: string | null;
  file_type?: string | null;
  file_name?: string | null;
}): MediaSource | null {
  if (row.audio_url) {
    return {
      url: row.audio_url,
      kind: "audio",
      filename: guessFilename(row.audio_url, "voice.webm"),
      contentType: "audio/webm",
    };
  }
  const fileType = (row.file_type ?? "").toLowerCase();
  if (row.file_url && fileType.startsWith("video/")) {
    const name =
      row.file_name?.trim() ||
      guessFilename(row.file_url, "video.mp4");
    return {
      url: row.file_url,
      kind: "video",
      filename: name.includes(".") ? name : `${name}.mp4`,
      contentType: fileType || "video/mp4",
    };
  }
  return null;
}

async function transcribeWithWhisper(
  bytes: ArrayBuffer,
  filename: string,
  contentType: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY non configurata: impossibile trascrivere."
    );
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], {
      type: contentType || "application/octet-stream",
    }),
    filename
  );
  form.append("model", WHISPER_MODEL);
  form.append("language", "it");
  form.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Whisper HTTP ${res.status}: ${errText.slice(0, 240) || res.statusText}`
    );
  }

  const text = (await res.text()).trim();
  if (!text) throw new Error("Trascrizione vuota.");
  return text;
}

/**
 * Trascrive automaticamente (o in retry) nota vocale / video chat → salva su messages.
 */
export async function transcribeChatVoiceMessageAction(
  raw: unknown
): Promise<
  | { success: true; message: ChatMessage }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("chat");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "messageId non valido." };
  }

  const supabase = await createClient();
  const { data: row, error: loadErr } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("id", parsed.data.messageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (loadErr) return { success: false, error: loadErr.message };
  if (!row) return { success: false, error: "Messaggio non trovato." };

  const media = resolveMediaSource(
    row as {
      audio_url?: string | null;
      file_url?: string | null;
      file_type?: string | null;
      file_name?: string | null;
    }
  );
  if (!media) {
    return {
      success: false,
      error: "Il messaggio non ha audio o video trascrivibile.",
    };
  }

  const existingStatus = (row as { transcript_status?: string | null })
    .transcript_status;
  const existingText = (row as { transcript_text?: string | null })
    .transcript_text;
  if (existingStatus === "done" && existingText?.trim()) {
    return {
      success: true,
      message: mapMessage(row as Parameters<typeof mapMessage>[0]),
    };
  }

  await supabase
    .from("messages")
    .update({
      transcript_status: "pending",
      transcript_error: null,
      transcript_by: auth.userId,
    })
    .eq("id", parsed.data.messageId);

  try {
    const mediaRes = await fetch(media.url);
    if (!mediaRes.ok) {
      throw new Error(`Download media fallito (${mediaRes.status}).`);
    }
    const bytes = await mediaRes.arrayBuffer();
    if (bytes.byteLength < 64) {
      throw new Error("File media troppo piccolo o vuoto.");
    }
    if (bytes.byteLength > 25 * 1024 * 1024) {
      throw new Error("File troppo grande per la trascrizione (max 25 MB).");
    }

    const contentType =
      mediaRes.headers.get("content-type") || media.contentType;
    const text = await transcribeWithWhisper(
      bytes,
      media.filename,
      contentType
    );

    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabase
      .from("messages")
      .update({
        transcript_text: text,
        transcript_status: "done",
        transcript_at: now,
        transcript_by: auth.userId,
        transcript_model: WHISPER_MODEL,
        transcript_error: null,
      })
      .eq("id", parsed.data.messageId)
      .select(MESSAGE_SELECT)
      .single();

    if (upErr || !updated) {
      return {
        success: false,
        error: upErr?.message ?? "Salvataggio trascrizione non riuscito.",
      };
    }

    const context =
      media.kind === "video"
        ? "chat_video_transcribe"
        : "chat_voice_transcribe";

    await writeAuditLog({
      entity_type: "messages",
      entity_id: parsed.data.messageId,
      action: context,
      actor_id: auth.userId,
      summary: `Trascrizione ${media.kind} chat (${WHISPER_MODEL})`,
      payload: {
        model: WHISPER_MODEL,
        kind: media.kind,
        chars: text.length,
        conversationId: (updated as { conversation_id: string })
          .conversation_id,
      },
    });

    await recordDecision({
      actorId: auth.userId,
      module: "chat",
      context,
      action: "transcribe",
      entityType: "messages",
      entityId: parsed.data.messageId,
      inputText: text.slice(0, 500),
      choiceBefore: { mediaKind: media.kind },
      choiceAfter: {
        transcriptChars: text.length,
        model: WHISPER_MODEL,
      },
      metadata: {
        conversationId: (updated as { conversation_id: string })
          .conversation_id,
      },
    });

    return {
      success: true,
      message: mapMessage(updated as Parameters<typeof mapMessage>[0]),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore trascrizione.";
    await supabase
      .from("messages")
      .update({
        transcript_status: "error",
        transcript_error: msg.slice(0, 500),
        transcript_at: new Date().toISOString(),
        transcript_by: auth.userId,
        transcript_model: WHISPER_MODEL,
      })
      .eq("id", parsed.data.messageId);

    console.error("[chat-transcribe]", msg);
    return { success: false, error: msg };
  }
}
