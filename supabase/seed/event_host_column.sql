-- EVENT HOST: additive column, nullable (legacy events unhosted until assigned)
alter table events add column if not exists host_id uuid references profiles(id);
create index if not exists idx_events_host_id on events(host_id);
