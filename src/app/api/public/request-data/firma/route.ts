import { NextResponse } from "next/server";
import { z } from "zod";
import { verificaOtpFirma } from "@/lib/anagrafica/richiesta-otp";

const schema = z.object({
  token: z.string().trim().min(20).max(200),
  email: z.string().trim().max(160),
  codice: z.string().trim().regex(/^\d{6}$/),
  documento: z.enum(["anagrafica", "privacy", "condizioni"]).optional(),
  firmatario: z.string().trim().max(120).optional(),
  accettoInformativa: z.boolean().optional(),
  consensoMarketing: z.enum(["presto", "nego"]).optional(),
  accettoCondizioni: z.boolean().optional(),
});

function ipDi(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "sconosciuto";
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ errore: "Inserisci il codice di 6 cifre." }, { status: 400 });
  }
  const esito = await verificaOtpFirma({
    token: parsed.data.token,
    email: parsed.data.email,
    codice: parsed.data.codice,
    documento: parsed.data.documento,
    firmatario: parsed.data.firmatario,
    accettoInformativa: parsed.data.accettoInformativa,
    consensoMarketing: parsed.data.consensoMarketing,
    accettoCondizioni: parsed.data.accettoCondizioni,
    ip: ipDi(request),
  });
  if ("errore" in esito) {
    return NextResponse.json(esito, { status: 400 });
  }
  return NextResponse.json(esito);
}
