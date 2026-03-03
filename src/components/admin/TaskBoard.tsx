'use client';

import { useState, useEffect } from 'react';
import { Plus, RefreshCw, ChevronDown, ChevronRight, Archive, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string | null;
  assignee?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  comment_count?: number;
}

interface AdminUser {
  id: string;
  full_name: string | null;
  email: string;
}

const mainColumns = [
  { id: 'todo', label: 'To Do', color: 'bg-muted' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-500/20' },
  { id: 'complete', label: 'Complete', color: 'bg-green-500/20' },
];

export function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setloading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [showArchive, setShowArchive] = useState(false);

  const fetchTasks = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (user.user) {
        setCurrentUserId(user.user.id);
      }

      const { data, error } = await supabase
        .from('admin_tasks')
        .select(`
          *,
          assignee:profiles!admin_tasks_assigned_to_fkey(full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Auto-archive completed tasks older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const toArchive = (data || []).filter(
        t => t.status === 'complete' && t.completed_at && new Date(t.completed_at) < sevenDaysAgo
      );
      if (toArchive.length > 0) {
        const archiveIds = toArchive.map(t => t.id);
        await supabase.from('admin_tasks').update({ status: 'blocked' }).in('id', archiveIds);
      }

      // Auto-delete archived tasks older than 30 days (from completed_at)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const toDelete = (data || []).filter(
        t => t.status === 'blocked' && t.completed_at && new Date(t.completed_at) < thirtyDaysAgo
      );
      if (toDelete.length > 0) {
        const deleteIds = toDelete.map(t => t.id);
        await supabase.from('admin_tasks').delete().in('id', deleteIds);
      }

      // Update local state: apply archive status changes and remove deleted
      const deleteSet = new Set(toDelete.map(t => t.id));
      const archiveSet = new Set(toArchive.map(t => t.id));
      const remainingData = (data || [])
        .filter(t => !deleteSet.has(t.id))
        .map(t => archiveSet.has(t.id) ? { ...t, status: 'blocked' } : t);

      // Get comment counts
      const taskIds = remainingData.map(t => t.id);
      if (taskIds.length > 0) {
        const { data: comments } = await supabase
          .from('admin_task_comments')
          .select('task_id')
          .in('task_id', taskIds);

        const commentCounts: Record<string, number> = {};
        comments?.forEach(c => {
          commentCounts[c.task_id] = (commentCounts[c.task_id] || 0) + 1;
        });

        setTasks(remainingData.map(t => ({
          ...t,
          comment_count: commentCounts[t.id] || 0,
        })));
      } else {
        setTasks(remainingData);
      }
    } catch (error: any) {
      toast.error('Failed to load tasks');
    } finally {
      setloading(false);
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (roleError) throw roleError;

      const userIds = roleData?.map(r => r.user_id) || [];
      if (userIds.length === 0) {
        setAdminUsers([]);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
        .is('deleted_at', null);

      if (profileError) throw profileError;

      setAdminUsers(profileData || []);
    } catch (error) {
      console.error('Failed to fetch admin users:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchAdminUsers();
  }, []);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsDialogOpen(true);
  };

  const handleNewTask = () => {
    setSelectedTask(null);
    setIsDialogOpen(true);
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic update
    setTasks(prev => 
      prev.map(t => 
        t.id === taskId 
          ? { ...t, status: newStatus, completed_at: newStatus === 'complete' ? new Date().toISOString() : null }
          : t
      )
    );

    try {
      const { error } = await supabase
        .from('admin_tasks')
        .update({ 
          status: newStatus,
          completed_at: newStatus === 'complete' ? new Date().toISOString() : null,
        })
        .eq('id', taskId);

      if (error) throw error;
    } catch (error: any) {
      toast.error('Failed to update task');
      fetchTasks(); // Revert on error
    }
  };

  const getTasksForColumn = (status: string) => {
    const columnTasks = tasks.filter(t => t.status === status);
    
    // Sort by due date (closest first) for To Do and In Progress columns
    if (status === 'todo' || status === 'in_progress') {
      return columnTasks.sort((a, b) => {
        // Tasks without due dates go to the bottom
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
    }
    
    return columnTasks;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="space-y-2 p-2">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Task Board</h3>
          <Button size="sm" onClick={handleNewTask}>
            <Plus className="w-4 h-4 mr-2" />
            Add Task
          </Button>
        </div>
        <div className="text-center py-12">
          <CheckSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-1">No tasks yet</h3>
          <p className="text-sm text-muted-foreground">Create your first task to get organized.</p>
        </div>
        <TaskDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          task={selectedTask}
          adminUsers={adminUsers}
          currentUserId={currentUserId}
          onSuccess={fetchTasks}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Task Board</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTasks}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleNewTask}>
            <Plus className="w-4 h-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mainColumns.map(column => (
          <div
            key={column.id}
            className="space-y-3"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${column.color}`}>
              <span className="font-medium text-sm text-foreground">{column.label}</span>
              <span className="text-xs text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
                {getTasksForColumn(column.id).length}
              </span>
            </div>
            
            <div className="space-y-2 min-h-[200px] p-2 rounded-lg border border-dashed border-border/50 bg-muted/20">
              {getTasksForColumn(column.id).map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task)}
                >
                  <TaskCard task={task} onClick={() => handleTaskClick(task)} />
                </div>
              ))}
              
              {getTasksForColumn(column.id).length === 0 && (
                <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                  No tasks
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Archive Section */}
      <div className="mt-2">
        <button
          onClick={() => setShowArchive(!showArchive)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors w-full"
        >
          {showArchive ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Archive className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm text-foreground">Archive</span>
          <span className="text-xs text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
            {getTasksForColumn('blocked').length}
          </span>
        </button>
        {showArchive && (
          <div
            className="mt-2 space-y-2 min-h-[100px] p-2 rounded-lg border border-dashed border-border/50 bg-muted/20"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'blocked')}
          >
            {getTasksForColumn('blocked').map(task => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task)}
              >
                <TaskCard task={task} onClick={() => handleTaskClick(task)} />
              </div>
            ))}
            {getTasksForColumn('blocked').length === 0 && (
              <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                No archived tasks
              </div>
            )}
          </div>
        )}
      </div>

      <TaskDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        task={selectedTask}
        adminUsers={adminUsers}
        currentUserId={currentUserId}
        onSuccess={fetchTasks}
      />
    </div>
  );
}
