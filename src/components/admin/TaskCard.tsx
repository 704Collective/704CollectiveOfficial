'use client';

import { format } from 'date-fns';
import { Calendar, User, GripVertical, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_to: string | null;
  created_at: string | null;
  assignee?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  comment_count?: number;
}

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
}

const priorityColors: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  urgent: 'bg-destructive/20 text-destructive border-destructive/30',
};

export function TaskCard({ task, onClick, isDragging = false }: TaskCardProps) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'complete';

  return (
    <div
      onClick={onClick}
      className={`bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-all group ${
        isDragging ? 'shadow-lg scale-105 rotate-2' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-foreground text-sm leading-tight line-clamp-2">
            {task.title}
          </h4>
          
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {task.description}
            </p>
          )}
          
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {task.priority && task.priority !== 'medium' && (
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1.5 py-0 ${priorityColors[task.priority] || ''}`}
              >
                {task.priority}
              </Badge>
            )}
            
            {task.due_date && (
              <div className={`flex items-center gap-1 text-[10px] ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                <Calendar className="w-3 h-3" />
                <span>{format(new Date(task.due_date), 'MMM d')}</span>
              </div>
            )}
            
            {(task.comment_count ?? 0) > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <MessageSquare className="w-3 h-3" />
                <span>{task.comment_count}</span>
              </div>
            )}
          </div>
          
          {task.assignee && (
            <div className="flex items-center gap-2 mt-3">
              <Avatar className="w-5 h-5">
                <AvatarImage src={task.assignee.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] bg-muted">
                  {task.assignee.full_name?.slice(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] text-muted-foreground truncate">
                {task.assignee.full_name || 'Unassigned'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
