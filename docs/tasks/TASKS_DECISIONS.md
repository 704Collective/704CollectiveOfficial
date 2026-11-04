# 704 Tasks - Locked Decisions (build spec)

Source of truth for the Tasks build. Decided by Adam Oct 25 - Nov 3, 2026. The clickable mockup (704 Tasks Mockup artifact) shows the screens. Where this doc and the old Oct 14 handoff spec disagree, this doc wins.

## Structure and people
- Super admins: Adam, Timi, Gabbi (profiles.role = super_admin). hello@704collective.com is excluded from assign lists and person views.
- Helper admins (profiles.role = admin) get Tasks ONLY. They see only their own tasks, never folder names, and create tasks only for themselves. Those land in "Needs a home" inside TEAM, attached to the Misc goal, until a super admin files them.
- Role lockdown is part of the build: lock "admin" to Tasks only; check the "lead" role (who has it, what it opens) and lock it down or remove it; finish the door check-in server-side lock.
- TEAM: super admin view only. Shows every task assigned to a helper, grouped by person. Same task, not a copy; it also lives in its real folder.
- Every task has one real home folder. Folders: top level + 1 subfolder level.
- Moving: super admins can move any task or folder into any folder. Keeps goal, owner, dates, notes, history. A move that would create a 3rd level is blocked.
- No sub-tasks; checklists only.
- Retired/deleted admins: their tasks go unassigned; their personal area is archived.
- Deleting: folders/goals with tasks can't be deleted until the tasks are moved ("move all to..."). Only super admins delete. Trash for 30 days, restorable. Saved History never changes.
- Colors: black/gold frame; each goal has its own palette color; task status grey open, gold in progress, green done, red overdue; a folder color stripe on each task.
- No offline mode (show "no connection"). Mobile-first; ships in the mobile app.

## Task basics
- Notes, checklists, comments with @mentions (mention = notification), activity log (who changed what, when).
- Attachments: photos, camera, files, Google Drive links. Cloudflare R2, 25MB per file.
- Priority High/Normal/Low: sorting only, never affects bars. Default size for new counted tasks: M.
- Multiple owners allowed.
- A task can be on more than one goal and counts full points in each. Time bars count it once; a parent goal counts it once even if 2 sub-goals share it.
- Quick add (+): title + date. Lands in the super admin's Inbox (or Needs a home for helpers) with Misc goal, size M, counts on. Adding from inside a folder puts it in that folder.
- Event templates: create a whole prep set with due dates counted back from the event date ("Create tasks from event"); tasks stay linked to the event.
- Search covers titles, notes, checklist items, comments, goal names/descriptions, folder names, attachment file names. Helpers search only their own tasks.
- Skipped for v1: dependencies, tags, folder default goals (super admins attach goals themselves; a "Needs a goal" list on the dashboard shows tasks on Misc).

## Views
- My Tasks: Today / This week / Overdue / Later / No date / Done, with a "Not counted" group.
- List, Board (drag Open / In progress / Done), Calendar (Mon-Sun, Charlotte time).
- Super admin dashboard: Monday recap, company time bars with person filter, Needs a decision, Requests, Needs a home / goal, Overdue, Due today, Goals.
- Search, filters (person, folder, goal, status, priority, due date, size, exempt), saved filters.
- Done tasks leave lists after 7 days; stay searchable and in History.
- Extras: Monday recap notification, confetti on goal complete, CSV export.
- Manage area (super admins): goals, folders, event templates, reason list, people/roles, trash, export.

## Progress bars
- Sizes: S=1, M=3, L=5, XL=10 points. Bar = done points / total points. Only done counts. Adding tasks can lower a bar.
- Time bars: Week (Mon-Sun), Month, Quarter, Year, calendar-based, Charlotte time. Each pulls every counted task due in its window. Each resets to 0 when its window ends.
- Due date decides the time bars. No due date: counts in its goal bar, skips time bars, shows "No date".
- Unfixed overdue tasks count against the current Week and Month bars as not done and carry forward until fixed.

## Exempt tasks ("Counts toward progress" off)
- Never move any bar. Otherwise identical to normal tasks (overdue, notifications, Fix it, reasons, pushed count, flags, approvals, on-time %, grey "Not counted" group in lists and History cards).
- Only super admins flip the switch; helpers request it (Requests list).
- While exempt: size hidden, goal optional. Flipping back to counts requires goal + size.

## Repeating tasks
- Weekly / monthly / quarterly / yearly. Each repeat is its own copy. One upcoming copy at a time; next appears when the current is done or its due passes. Schedule never drifts.
- Edit asks "Just this one, or all future?". "Stop repeating" ends future copies.
- Missed copies go overdue with Fix it (Done late, or Missed + why), no reschedule. Only the newest missed copy stays in the pile; older ones auto-close as "Missed (no reason given)".

## Overdue flow
- "Due soon" (yellow) 2 days before due. Overdue at midnight ET after the due date (or right after a set time).
- Overdue pile: owners see their own; super admins see all. Red badge with count on the Tasks icon.
- Fix it: Reschedule (optionally change folder/goal/owner), Park (remove date), Done late, Cancel.
- Every fix needs a one-tap reason (Ran out of time / Waiting on someone / Priorities changed / Blocked / Other) + optional note. Reason list editable in Manage.
- Pushing any due date later (even before overdue) asks why and adds "Pushed Nx". Earlier is free.
- Helpers can Reschedule / Done late on their own tasks. Park, Cancel and "don't count" need super admin approval. Until decided, the task stays red and keeps counting.
- Bulk fix (multi-select; swipe on phone). Undo 10 seconds. Super admins can reopen anything from History.
- Needs a decision: tasks 7+ days overdue or pushed 3x, plus overdue goals.
- Multiple owners: any owner can fix; History shows who. Unassigned overdue tasks go to the super admins' pile.
- Notifications: in-portal bell only (push later in the app). No emails at all, including assignment.

## Cancel (tasks and goals)
- Anytime, with a reason. Cancelled never shows negatively: grey in History with reason, never missed, never in on-time %, never pulls a bar down.

## History
- History tab: Week/Month/Quarter/Year cards, newest first: final %, done/missed/cancelled counts, period note. Tap for every task with owner, goal, folder, outcome, why, what happened after.
- Scores lock 24h after the period ends (grace). New bar starts at 0 immediately. Cards are frozen snapshots.
- Done on time vs late tracked; per-person on-time % super admins only. Super admins add period notes.
- History > Goals: completed, failed, cancelled goals.

## Goals
- Task goals and number goals. Number goals auto-fill from our data where possible (new paying members, active members, business members, check-ins; revenue later). "Log progress" manual entries (who, when, note) as backup.
- Number goal "Counts toward time bars" switch: off by default, super admins only; gets a size; counts in every time bar whose window covers the goal's whole date range; partial credit, capped at full, can go backwards.
- Sub-goals 1 level. Parent bar = points math (task sub-goals bring points; number sub-goals bring % x size; direct tasks add points).
- Goal overdue: red, Needs a decision. Leave as failed (tasks stay attached) or Extend (new date + reason + pushed count, always available later; afterwards looks normal, History keeps one line).
- At 100%: "Ready to complete" + notification; super admin taps Mark complete; moves to History, closed to new tasks; Reopen available (History notes it). Completing a parent completes sub-goals. Misc never completes. Completing never changes time bars.
- New goal: name, kind, color, due or TBD, optional parent.

## Visibility
- Super admins: company bars + person filter + full History.
- Helpers: personal My Week/Month/Quarter/Year from their own tasks, own history only, plus goal bars their tasks feed.

## Testing
- Develop-only time machine ("pretend it's <date>") for rollovers, grace lock, repeats, missed copies. Never on prod.
- Fake helper admin on develop to prove the walls.
- Cursor built-in browser tests, desktop 1440x900 + mobile 390x844, on the practice copy.

## Build order
1. Schema (tm_ tables), RLS, grants, role lockdown, lead role check.
2. Core: folders, tasks CRUD, My Tasks, task detail, quick add, comments, checklist, attachments, activity.
3. Goals + points math + time bars + dashboard.
4. Overdue flow, repeats, requests, notifications, needs-a-decision.
5. History snapshots + cron + time machine.
6. Board, calendar, templates, search/filters, export, Manage, helper walls, polish.
7. Import (106 tasks + tracker rows + business master sheet): fresh dates or parked, decided at import time.
