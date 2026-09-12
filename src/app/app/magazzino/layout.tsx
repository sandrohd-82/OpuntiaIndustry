import { requireAreaAccess } from "@/lib/areas/guard";

export default async function MagazzinoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAreaAccess("magazzino");
  return <>{children}</>;
}
