"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { mapMessage, type ChatMessage } from "@/lib/chat/types";
import { recordDecision } from "@/lib/learning/decision-events";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const WHISPER_MODEL = process.env.CHAT_TRANSCRIBE_MODEL?.trim() || "whisper-1";

const schema = z.object({
  messageId: z.string().uuid(),
});

const MESSAGE_SELECT =
  "id, conversation_id, sender_id, content, created_at, is_read, status, audio_url, file_url, file_type, file_name, transcript_text, transcript_status, transcript_at, transcript_by, transcript_model, transcript_error";

function guessAudioFilename(url: string): string {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").pop() || "voice.webm";
    return base.includes(".") ? base : `${base}.webm`;
  } catch {
    return "voice.webm";
  }
}

async function transcribeWithWhisper(
  audioBytes: ArrayBuffer,
  filename: string,
  contentType: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY non configurata: impossibile trascrivere l’audio."
    );
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audioBytes)], {
      type: contentType || "audio/webm",
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
 * Trascrive on-demand una nota vocale chat (Whisper) e salva il testo sul messaggio.
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

  const audioUrl = (row as { audio_url?: string | null }).audio_url;
  if (!audioUrl) {
    return { success: false, error: "Il messaggio non ha audio." };
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
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Download audio fallito (${audioRes.status}).`);
    }
    const bytes = await audioRes.arrayBuffer();
    if (bytes.byteLength < 64) {
      throw new Error("File audio troppo piccolo o vuoto.");
    }
    if (bytes.byteLength > 24 * 1024 * 1024) {
      throw new Error("File audio troppo grande per la trascrizione.");
    }

    const contentType =
      audioRes.headers.get("content-type") || "audio/webm";
    const text = await transcribeWithWhisper(
      bytes,
      guessAudioFilename(audioUrl),
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

    await writeAuditLog({
      entity_type: "messages",
      entity_id: parsed.data.messageId,
      action: "chat_voice_transcribe",
      actor_id: auth.userId,
      summary: `Trascrizione vocale chat (${WHISPER_MODEL})`,
      payload: {
        model: WHISPER_MODEL,
        chars: text.length,
        conversationId: (updated as { conversation_id: string }).conversation_id,
      },
    });

    await recordDecision({
      actorId: auth.userId,
      module: "chat",
      context: "chat_voice_transcribe",
      action: "transcribe",
      entityType: "messages",
      entityId: parsed.data.messageId,
      inputText: text.slice(0, 500),
      choiceBefore: { audioUrl: true },
      choiceAfter: {
        transcriptChars: text.length,
        model: WHISPER_MODEL,
      },
      metadata: {
        conversationId: (updated as { conversation_id: string }).conversation_id,
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
