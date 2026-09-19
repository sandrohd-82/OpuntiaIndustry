import { NextResponse } from "next/server";
import { createTicketAction } from "@/app/actions/strumenti-ticket";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await createTicketAction(formData);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invio ticket non riuscito.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
