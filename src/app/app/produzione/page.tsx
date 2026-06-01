import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function ProduzionePage() {
  const { meta } = await requireAreaAccess("produzione");
  return <AreaPlaceholder title={meta.label} description={meta.description} />;
}
