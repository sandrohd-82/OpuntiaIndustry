import { NextResponse } from "next/server";
import {
  getCompanyFiscalProfileAction,
  updateCompanyFiscalProfileAction,
} from "@/app/actions/fiscal-profile";

export async function GET() {
  const result = await getCompanyFiscalProfileAction();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.profile);
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido." }, { status: 400 });
  }
  const result = await updateCompanyFiscalProfileAction(
    body as Parameters<typeof updateCompanyFiscalProfileAction>[0]
  );
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.profile);
}
