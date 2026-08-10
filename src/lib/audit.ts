import { createClient } from "@/lib/supabase/server";
import type { AuditLogInsert } from "@/types/database";

export async function writeAuditLog(input: AuditLogInsert): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("audit_log").insert(input);
    if (error) {
      console.error("[audit_log]", error.message, input);
    }
  } catch (e) {
    console.error("[audit_log]", e);
  }
}

export { fraseConfermaSoftDelete } from "@/lib/soft-delete";
