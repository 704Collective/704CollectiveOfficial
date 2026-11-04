import { FoldersView } from '@/components/tasks/FoldersView';

export default async function FolderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FoldersView folderId={id} />;
}
