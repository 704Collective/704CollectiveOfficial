import { HistoryPeriodView } from '@/components/tasks/HistoryPeriodView';

export default async function HistoryPeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HistoryPeriodView id={id} />;
}
