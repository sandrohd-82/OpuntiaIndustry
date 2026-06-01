import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function ImpostazioniPage() {
  const { meta } = await requireAreaAccess("impostazioni");
  return <AreaPlaceholder title={meta.label} description={meta.description} />;
}
