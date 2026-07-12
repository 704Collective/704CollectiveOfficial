-- Project 5.11 — Soft-delete pattern for admin_tasks.
-- 
-- Background: The frontend TaskBoard had two dangerous auto-cleanup blocks
-- in fetchTasks() that ran on every page load:
--   1. Auto-archived completed tasks older than 7 days (status -> blocked)
--   2. Hard-deleted blocked tasks older than 30 days (.delete())
--
-- The hard-delete was a P0 data loss bug — admins lost tasks they thought
-- were archived. Frontend has been fixed to use soft-delete via deleted_at.
-- This migration adds the supporting columns and indexes.
--
-- Status: schema applied to production via SQL editor on 2026-05-14, then
-- migration file added retroactively for reproducibility.

ALTER TABLE public.admin_tasks 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_archived_at 
ON public.admin_tasks(archived_at) WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_deleted_at 
ON public.admin_tasks(deleted_at) WHERE deleted_at IS NOT NULL;

-- Backfill: tasks already marked 'blocked' get archived_at backfilled to their
-- most recent timestamp. Without this, existing archived tasks have no archive
-- timestamp and would be sortable only by created_at in the archive view.
UPDATE public.admin_tasks 
SET archived_at = COALESCE(completed_at, updated_at, created_at, NOW())
WHERE status = 'blocked' AND archived_at IS NULL;