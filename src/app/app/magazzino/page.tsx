import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function MagazzinoPage() {
  const { meta } = await requireAreaAccess("magazzino");
  return <AreaPlaceholder title={meta.label} description={meta.description} />;
}
