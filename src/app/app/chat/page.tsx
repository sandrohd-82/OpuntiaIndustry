import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstChatPath } from "@/lib/areas/chat";

export default async function ChatIndexPage() {
  await requireAreaAccess("chat");
  redirect(getFirstChatPath());
}
