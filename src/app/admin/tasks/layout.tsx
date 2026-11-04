import { nwSerif } from '@/lib/network/fonts';
import { TasksProvider } from '@/components/tasks/TasksProvider';
import { TasksShell } from '@/components/tasks/TasksShell';
import './tasks.css';

export const dynamic = 'force-dynamic';

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`tm ${nwSerif.variable}`}>
      <TasksProvider>
        <TasksShell>{children}</TasksShell>
      </TasksProvider>
    </div>
  );
}
