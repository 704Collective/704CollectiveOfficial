import type { SocialPlatform } from './constants';

export type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled';
export type ApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type InboxMessageStatus = 'unread' | 'read' | 'replied' | 'archived' | 'spam';
export type InboxMessageType = 'comment' | 'dm' | 'mention' | 'reply';

export interface SocialAccountRow {
  id: string;
  workspace_id: string;
  platform: SocialPlatform;
  account_id: string;
  account_name: string;
  account_handle: string | null;
  account_type: string | null;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  post_count: number;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
  last_synced_at: string | null;
  sync_error: string | null;
  platform_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SocialPostRow {
  id: string;
  workspace_id: string;
  caption: string;
  media_urls: string[];
  media_types: string[];
  status: SocialPostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_ids: Record<string, string>;
  target_account_ids: string[];
  campaign_id: string | null;
  link_url: string | null;
  hashtags: string[];
  mentions: string[];
  first_comment: string | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  parent_post_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GetSocialPostsOptions {
  status?: SocialPostStatus | 'all';
  platform?: SocialPlatform | 'all';
  accountId?: string | 'all';
  campaignId?: string | 'all';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface GetInboxOptions {
  status?: InboxMessageStatus | 'all';
  platform?: SocialPlatform | 'all';
  accountId?: string | 'all';
  type?: InboxMessageType | 'all';
  assignedTo?: string | 'me' | 'all';
  search?: string;
  limit?: number;
  offset?: number;
}
