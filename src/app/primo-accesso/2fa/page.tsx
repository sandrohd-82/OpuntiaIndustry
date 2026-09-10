import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/session";

export default async function PrimoAccesso2faPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  redirect("/verify-email");
}
