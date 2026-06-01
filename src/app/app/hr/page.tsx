import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function HrPage() {
  const { meta } = await requireAreaAccess("hr");
  return <AreaPlaceholder title={meta.label} description={meta.description} />;
}
