import {
  preparaTicketUploadAction,
  registraTicketFileAction,
  uploadTicketFileBase64Action,
} from "@/app/actions/strumenti-ticket";
import { TICKET_BUCKET } from "@/lib/strumenti/ticket";
import { createClient } from "@/lib/supabase/client";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function caricaFileTicketLatoClient(input: {
  ticketId: string;
  messaggioId: string;
  files: File[];
}): Promise<{ error?: string }> {
  if (!input.files.length) return {};
  const sb = createClient();
  for (const file of input.files) {
    const prep = await preparaTicketUploadAction({
      ticketId: input.ticketId,
      messaggioId: input.messaggioId,
      fileName: file.name,
      mime: file.type,
    });
    if (prep.success) {
      const { error } = await sb.storage
        .from(TICKET_BUCKET)
        .uploadToSignedUrl(prep.path, prep.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (!error) {
        const reg = await registraTicketFileAction({
          ticketId: input.ticketId,
          messaggioId: input.messaggioId,
          path: prep.path,
          fileName: file.name,
          mime: file.type,
          size: file.size,
        });
        if (!reg.success) return { error: reg.error };
        continue;
      }
    }
    const base64 = await fileToBase64(file);
    const fb = await uploadTicketFileBase64Action({
      ticketId: input.ticketId,
      messaggioId: input.messaggioId,
      fileName: file.name,
      mime: file.type,
      base64,
    });
    if (!fb.success) return { error: fb.error };
  }
  return {};
}
