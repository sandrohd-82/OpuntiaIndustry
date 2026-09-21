import {
  preparaTicketUploadAction,
  registraTicketFileAction,
} from "@/app/actions/strumenti-ticket";
import { TICKET_BUCKET } from "@/lib/strumenti/ticket";
import { createClient } from "@/lib/supabase/client";

async function registra(input: {
  ticketId: string;
  messaggioId: string;
  path: string;
  file: File;
}) {
  return registraTicketFileAction({
    ticketId: input.ticketId,
    messaggioId: input.messaggioId,
    path: input.path,
    fileName: input.file.name || "allegato.bin",
    mime: input.file.type || "application/octet-stream",
    size: input.file.size,
  });
}

async function viaApi(input: {
  ticketId: string;
  messaggioId: string;
  file: File;
}): Promise<{ success: boolean; error?: string }> {
  const fd = new FormData();
  fd.set("ticketId", input.ticketId);
  fd.set("messaggioId", input.messaggioId);
  fd.set("file", input.file, input.file.name || "allegato.bin");
  const res = await fetch("/api/strumenti/ticket/allegato", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  const data = (await res.json().catch(() => null)) as
    | { success: true }
    | { success: false; error: string }
    | null;
  if (!data) return { success: false, error: "Risposta vuota dal server." };
  if (!data.success) return { success: false, error: data.error };
  return { success: true };
}

export async function caricaFileTicketLatoClient(input: {
  ticketId: string;
  messaggioId: string;
  files: File[];
  onProgress?: (msg: string) => void;
}): Promise<{ error?: string }> {
  if (!input.files.length) return {};
  const sb = createClient();
  const tot = input.files.length;
  let i = 0;
  for (const file of input.files) {
    i += 1;
    input.onProgress?.(
      `Caricamento allegato ${i}/${tot}: ${file.name || "file"}…`
    );
    const prep = await preparaTicketUploadAction({
      ticketId: input.ticketId,
      messaggioId: input.messaggioId,
      fileName: file.name || "allegato.bin",
      mime: file.type || "application/octet-stream",
    });
    let ok = false;
    if (prep.success) {
      try {
        const put = await fetch(prep.signedUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${prep.token}`,
            "Content-Type": file.type || "application/octet-stream",
            "x-upsert": "true",
          },
          body: file,
        });
        if (put.ok) {
          const reg = await registra({
            ticketId: input.ticketId,
            messaggioId: input.messaggioId,
            path: prep.path,
            file,
          });
          if (reg.success) ok = true;
        }
      } catch {
        ok = false;
      }
      if (!ok) {
        const { error } = await sb.storage
          .from(TICKET_BUCKET)
          .uploadToSignedUrl(prep.path, prep.token, file);
        if (!error) {
          const reg = await registra({
            ticketId: input.ticketId,
            messaggioId: input.messaggioId,
            path: prep.path,
            file,
          });
          if (reg.success) ok = true;
        }
      }
    }
    if (!ok) {
      const api = await viaApi({
        ticketId: input.ticketId,
        messaggioId: input.messaggioId,
        file,
      });
      if (!api.success) {
        return { error: api.error ?? `Impossibile caricare «${file.name}».` };
      }
    }
  }
  return {};
}
