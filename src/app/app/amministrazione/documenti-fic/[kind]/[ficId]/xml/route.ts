import { NextResponse } from "next/server";
import {
  parseFicKindParam,
  resolveFicDocumentXml,
} from "@/lib/amministrazione/fic-document-xml";
import { requireAreaAccess } from "@/lib/areas/guard";

type Ctx = {
  params: Promise<{ kind: string; ficId: string }>;
};

export async function GET(_req: Request, ctx: Ctx) {
  await requireAreaAccess("amministrazione");
  const { kind: kindParam, ficId: ficIdParam } = await ctx.params;
  const kind = parseFicKindParam(kindParam);
  const ficId = Number(ficIdParam);
  if (!kind || !Number.isFinite(ficId) || ficId <= 0) {
    return new NextResponse("Documento non trovato", { status: 404 });
  }

  try {
    const { xml, filename } = await resolveFicDocumentXml({ kind, ficId });
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "XML non disponibile.";
    return new NextResponse(msg, {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
