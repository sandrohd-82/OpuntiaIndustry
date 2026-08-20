import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  bankPdfRowsToCsv,
  parseBankPdfDeterministic,
} from "@/lib/amministrazione/bank-pdf-python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/bank/pdf-parse
 * multipart: file=PDF
 * ?format=json|xlsx|csv
 *
 * Parser Python deterministico (pdfplumber) — nessun LLM.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Devi accedere all’app prima." }, { status: 401 });
  }
  if (!auth.isSecondFactorVerified) {
    return NextResponse.json(
      { error: "Completa la verifica in due passaggi." },
      { status: 403 }
    );
  }
  if (!userCanAccessArea(auth.areas, "area-fiscale")) {
    return NextResponse.json(
      { error: "Non hai permesso per Area Fiscale." },
      { status: 403 }
    );
  }

  const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Seleziona un file PDF." },
      { status: 400 }
    );
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Estensione richiesta: .pdf" },
      { status: 400 }
    );
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json(
      { error: "PDF troppo grande (max 20 MB)." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { result, excelBuffer } = await parseBankPdfDeterministic(buffer, {
      excel: true,
      jsonFile: true,
    });

    if (format === "xlsx") {
      if (!excelBuffer) {
        return NextResponse.json(
          { error: "Excel non generato (0 movimenti?)." },
          { status: 422 }
        );
      }
      const filename = file.name.replace(/\.pdf$/i, "") + "_movimenti.xlsx";
      return new NextResponse(new Uint8Array(excelBuffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Bank-Pdf-Count": String(result.count),
          "X-Bank-Pdf-Parser": result.parser,
        },
      });
    }

    if (format === "csv") {
      const csv = bankPdfRowsToCsv(result.rows);
      const filename = file.name.replace(/\.pdf$/i, "") + "_movimenti.csv";
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Bank-Pdf-Count": String(result.count),
        },
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/bank/pdf-parse]", e);
    return NextResponse.json(
      {
        ok: false,
        openai: false,
        error: e instanceof Error ? e.message : "Parsing PDF fallito.",
      },
      { status: 500 }
    );
  }
}
