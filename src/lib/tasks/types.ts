export type TmRole = 'super_admin' | 'admin';
export type TmStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type TmSize = 'S' | 'M' | 'L' | 'XL';
export type TmPriority = 'high' | 'normal' | 'low';
export type TmRepeat = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type TmBucket = 'today' | 'this_week' | 'overdue' | 'later' | 'no_date' | 'done';

export type TmOwner = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
};

export type TmGoalRef = {
  id: string;
  name: string;
  color: string | null;
  is_misc: boolean;
};

export type TmTask = {
  id: string;
  title: string;
  notes: string | null;
  status: TmStatus;
  size: TmSize;
  priority: TmPriority;
  due_date: string | null;
  due_time: string | null;
  counts: boolean;
  repeat: TmRepeat;
  needs_home: boolean;
  pushed_count: number;
  cancelled_reason: string | null;
  done_at: string | null;
  done_late: boolean;
  missed?: boolean;
  repeat_series_id?: string | null;
  repeat_anchor_date?: string | null;
  created_at: string;
  updated_at: string;
  overdue: boolean;
  due_soon: boolean;
  folder_color: string;
  folder_id?: string | null;
  folder_name?: string | null;
  parent_folder_name?: string | null;
  owners: TmOwner[];
  goals: TmGoalRef[];
};

export type TmFolder = {
  id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  sort: number;
  archived_at: string | null;
  open_count: number;
};

export type TmStaff = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
};

export type TmBootstrap = {
  role: TmRole;
  profile_id: string;
  full_name: string | null;
  overdue_count: number;
  unread_count?: number;
  honor_time_machine?: boolean;
  time_machine?: string | null;
  effective_today?: string;
  reasons: string[];
  inbox_folder_id: string | null;
  misc_folder_id: string | null;
  misc_goal_id: string | null;
  folders: TmFolder[];
  goals: TmGoalRef[];
  staff: TmStaff[];
};

export type TmBucketGroup = {
  counted: TmTask[];
  not_counted: TmTask[];
};

export type TmMyTasks = {
  today: TmBucketGroup;
  this_week: TmBucketGroup;
  overdue: TmBucketGroup;
  later: TmBucketGroup;
  no_date: TmBucketGroup;
  done: TmBucketGroup;
  overdue_count: number;
};

export type TmTeamPerson = {
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  tasks: TmTask[];
};

export type TmChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  sort: number;
};

export type TmComment = {
  id: string;
  body: string;
  mentions: string[];
  author_id: string | null;
  created_at: string;
  author_name?: string | null;
  author_avatar?: string | null;
};

export type TmAttachment = {
  id: string;
  name: string;
  size: number | null;
  r2_key: string | null;
  drive_url: string | null;
  created_at: string;
};

export type TmActivity = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
};

export type TmRequest = {
  id: string;
  kind: string;
  status: string;
  reason: string | null;
  created_at: string;
};

export type TmNotification = {
  id: string;
  profile_id?: string;
  kind: string;
  title: string;
  body: string | null;
  task_id?: string | null;
  goal_id?: string | null;
  created_at: string;
  read_at?: string | null;
};

export type TmTaskDetail = TmTask & {
  checklist: TmChecklistItem[];
  comments: TmComment[];
  attachments: TmAttachment[];
  activity: TmActivity[];
  notifications: TmNotification[];
  requests: TmRequest[];
};

export type TmTrashedFolder = {
  id: string;
  name: string;
  color: string | null;
  deleted_at: string;
};

export type TmProgress = {
  got: number;
  total: number;
  pct: number;
  kind?: string;
  starts?: string;
  ends?: string;
};

export type TmGoal = TmGoalRef & {
  description?: string | null;
  kind: 'task' | 'number' | 'parent';
  due_date: string | null;
  parent_id: string | null;
  status: 'active' | 'ready' | 'completed' | 'failed' | 'cancelled';
  completed_at?: string | null;
  number_current?: number | null;
  number_target?: number | null;
  number_unit?: string | null;
  number_source?: string | null;
  counts_time_bars: boolean;
  size?: TmSize | null;
  range_start?: string | null;
  range_end?: string | null;
  pushed_count?: number;
  got: number;
  total: number;
  pct: number;
  tags: string[];
  children?: TmGoal[];
};

export type TmGoalDetail = TmGoal & {
  log: { id: string; delta: number; note: string | null; logged_at: string; logged_by_name: string | null }[];
  counted_tasks: TmTask[];
  not_counted_tasks: TmTask[];
};

export type TmRequestRow = {
  id: string;
  task_id: string;
  task_title: string;
  kind: string;
  reason: string | null;
  status: string;
  created_at: string;
  requested_by: string;
  requester_name: string | null;
};

export type TmDashboard = {
  role: TmRole;
  recap: { placeholder: boolean; headline: string };
  bars: { week: TmProgress; month: TmProgress; quarter: TmProgress; year: TmProgress };
  people: { id: string; full_name: string | null; role: string }[];
  needs_decision: { id: string; title: string; kind: string; overdue_days?: number; pushed_count?: number; due_date?: string }[];
  requests: TmRequestRow[];
  needs_home: TmTask[];
  needs_goal: TmTask[];
  overdue: TmTask[];
  due_today: TmTask[];
  goals: TmGoal[];
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
