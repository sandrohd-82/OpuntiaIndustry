import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function AmministrazionePage() {
  const { meta } = await requireAreaAccess("amministrazione");
  return <AreaPlaceholder title={meta.label} description={meta.description} />;
}
