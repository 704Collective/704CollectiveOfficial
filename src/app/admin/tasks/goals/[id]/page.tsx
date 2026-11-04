import { GoalDetailView } from '@/components/tasks/GoalDetailView';

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GoalDetailView id={id} />;
}
