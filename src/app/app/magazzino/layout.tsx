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
      <WorkcenterCameraBar
        className="mx-6 mt-3"
        targetKind="area"
        areaCodice="magazzino"
      />
      {children}
    </>
  );
}
