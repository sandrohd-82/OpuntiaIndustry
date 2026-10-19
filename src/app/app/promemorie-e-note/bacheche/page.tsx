import { AppHeader } from "@/components/layout/AppHeader";
import { BachecheHome } from "@/components/kanban/BachecheHome";
import { requireAreaAccess } from "@/lib/areas/guard";

export const maxDuration = 60;

export default async function BachechePage() {
  await requireAreaAccess("promemorie-e-note");
  return (
    <>
      <AppHeader
        title="Bacheche"
        subtitle="Flussi di lavoro a colonne, con schede, scadenze e modelli."
      />
      <div className="p-6">
        <BachecheHome />
      </div>
    </>
  );
}
