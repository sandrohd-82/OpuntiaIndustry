import { notFound } from "next/navigation";
import { DiagnosticaPrestazioni } from "@/components/diagnostica/DiagnosticaPrestazioni";
import { getAuthContext } from "@/lib/auth/session";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";

export default async function PrestazioniPage() {
  const auth = await getAuthContext();
  if (!auth || !isUnrestrictedSuperadmin(auth)) notFound();
  return (
    <DiagnosticaPrestazioni origine={process.env.VERCEL ? "produzione" : "locale"} />
  );
}
