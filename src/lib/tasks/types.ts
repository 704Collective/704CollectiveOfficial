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
  profile_id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
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

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
