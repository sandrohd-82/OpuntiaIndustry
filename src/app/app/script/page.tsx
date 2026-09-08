import { redirect } from "next/navigation";

export default function ScriptRemovedPage() {
  redirect("/app/dashboard");
}
