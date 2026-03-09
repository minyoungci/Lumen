import { redirect } from "next/navigation";

export default function SharedKanbanRedirectPage() {
  redirect("/shared/feed");
}
