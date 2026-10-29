import { leggiCopiaFirmata } from "@/lib/anagrafica/richiesta-otp";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const esito = await leggiCopiaFirmata(token);
  if ("errore" in esito) {
    return new Response(esito.errore, { status: 400 });
  }
  return new Response(new Uint8Array(esito.bytes), {
    status: 200,
    headers: {
      "Content-Type": esito.mime,
      "Content-Disposition": `attachment; filename="${esito.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
