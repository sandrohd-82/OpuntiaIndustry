import { AppHeader } from "@/components/layout/AppHeader";
import { ScriptElencoBoard } from "@/components/script/ScriptElencoBoard";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function ScriptElencoPage() {
  await requireAreaAccess("script");
  return (
    <>
      <AppHeader
        title="Script"
        subtitle="Funzioni del gestionale collegabili alle attività (es. Pesata)."
      />
      <div className="p-6">
        <ScriptElencoBoard />
      </div>
    </>
  );
}
