import { WorkcenterCameraBar } from "@/components/produzione/WorkcenterCameraBar";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function MagazzinoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAreaAccess("magazzino");
  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-3">
        <WorkcenterCameraBar targetKind="area" areaCodice="magazzino" />
      </div>
      {children}
    </>
  );
}
