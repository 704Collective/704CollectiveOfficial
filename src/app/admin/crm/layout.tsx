import { AdminLayout } from '@/components/AdminLayout';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminLayout title="">
      {children}
    </AdminLayout>
  );
}