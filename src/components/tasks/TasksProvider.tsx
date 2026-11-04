'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tmBootstrap } from '@/app/actions/tasksActions';
import type { TmBootstrap, TmFolder } from '@/lib/tasks/types';

type TasksContextValue = {
  boot: TmBootstrap | null;
  loading: boolean;
  offline: boolean;
  markFetchFailed: () => void;
  refresh: () => Promise<void>;
  setFolders: (folders: TmFolder[]) => void;
  isSuper: boolean;
  defaultFolderId: string | null;
};

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({
  children,
  defaultFolderId = null,
}: {
  children: React.ReactNode;
  defaultFolderId?: string | null;
}) {
  const [boot, setBoot] = useState<TmBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await tmBootstrap();
      if (!res.ok) {
        setOffline(true);
        return;
      }
      setBoot(res.data);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    setOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, [load]);

  const setFolders = useCallback((folders: TmFolder[]) => {
    setBoot((prev) => (prev ? { ...prev, folders } : prev));
  }, []);

  const value = useMemo<TasksContextValue>(
    () => ({
      boot,
      loading,
      offline,
      markFetchFailed: () => setOffline(true),
      refresh: load,
      setFolders,
      isSuper: boot?.role === 'super_admin',
      defaultFolderId,
    }),
    [boot, loading, offline, load, setFolders, defaultFolderId]
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used inside TasksProvider');
  return ctx;
}
