import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function CommercialePage() {
  const { meta } = await requireAreaAccess("commerciale");
  return <AreaPlaceholder title={meta.label} description={meta.description} />;
}
