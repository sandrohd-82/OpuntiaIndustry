import { TICKET_MAX_FILE_PER_MSG } from "@/lib/strumenti/ticket";

export type TicketAllegatoBytes = {
  name: string;
  mime: string;
  bytes: Buffer;
};

async function daEntry(v: FormDataEntryValue | null): Promise<TicketAllegatoBytes | null> {
  if (!v || typeof v === "string") return null;
  const blob = v as Blob;
  if (typeof blob.arrayBuffer !== "function") return null;
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (!bytes.length) return null;
  const named = v as File;
  const name =
    typeof named.name === "string" && named.name.trim()
      ? named.name.trim()
      : "allegato.bin";
  return { name, mime: blob.type || "", bytes };
}

export async function allegatiDaFormData(
  formData: FormData
): Promise<TicketAllegatoBytes[]> {
  const raw: FormDataEntryValue[] = [
    ...formData.getAll("files"),
    ...formData.getAll("file"),
    ...formData.getAll("allegati"),
  ];
  for (let i = 0; i < TICKET_MAX_FILE_PER_MSG + 2; i++) {
    const v = formData.get(`file_${i}`);
    if (v) raw.push(v);
  }
  const seen = new Set<string>();
  const out: TicketAllegatoBytes[] = [];
  for (const v of raw) {
    const f = await daEntry(v);
    if (!f) continue;
    const key = `${f.name}:${f.bytes.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export async function audioDaFormData(
  formData: FormData
): Promise<TicketAllegatoBytes | null> {
  return daEntry(formData.get("audio"));
}

export function fileCountAtteso(formData: FormData): number {
  const n = Number(String(formData.get("fileCount") ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
