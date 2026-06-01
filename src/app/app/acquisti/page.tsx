import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function AcquistiPage() {
  const { meta } = await requireAreaAccess("acquisti");
  return <AreaPlaceholder title={meta.label} description={meta.description} />;
}
