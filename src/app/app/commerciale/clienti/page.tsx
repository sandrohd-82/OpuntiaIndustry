import { notFound } from "next/navigation";
import { ClientiBoard } from "@/components/amministrazione/ClientiBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { resolveCommercialePage } from "@/lib/areas/commerciale";
import { requireAnyAreaAccess } from "@/lib/areas/guard";

export const maxDuration = 300;

export default async function CommercialeClientiPage() {
  await requireAnyAreaAccess(["commerciale", "amministrazione"]);

  const page = resolveCommercialePage(["clienti"]);
  if (!page) notFound();

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        <ClientiBoard />
      </div>
    </>
  );
}
