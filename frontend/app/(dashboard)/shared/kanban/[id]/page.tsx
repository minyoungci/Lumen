import { redirect } from "next/navigation";

interface SharedKanbanDetailRedirectPageProps {
  params: { id: string };
}

export default function SharedKanbanDetailRedirectPage({ params }: SharedKanbanDetailRedirectPageProps) {
  redirect(`/shared/feed/${params.id}`);
}
