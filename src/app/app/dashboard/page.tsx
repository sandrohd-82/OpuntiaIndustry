import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function DashboardPage() {
  const { meta } = await requireAreaAccess("dashboard");
  return <AreaPlaceholder title={meta.label} description={meta.description} />;
}
