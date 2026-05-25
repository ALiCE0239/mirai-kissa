-- 未来喫茶 — アクセス・利用回数集計（Supabase）
-- SQL Editor でこのファイルの内容を実行してください。

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('page_view', 'tool_use')),
  path text,
  tool text,
  visitor_id text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_type_idx
  on public.analytics_events (event_type);

alter table public.analytics_events enable row level security;

-- 誰でも記録のみ可能（anon key は公開前提。読み取りは不可）
drop policy if exists "analytics_insert_anon" on public.analytics_events;
create policy "analytics_insert_anon"
  on public.analytics_events
  for insert
  to anon
  with check (
    event_type in ('page_view', 'tool_use')
    and (path is null or char_length(path) <= 64)
    and (tool is null or char_length(tool) <= 32)
    and (visitor_id is null or char_length(visitor_id) <= 64)
  );

-- 管理者（ログイン済み）のみ閲覧可能
drop policy if exists "analytics_select_auth" on public.analytics_events;
create policy "analytics_select_auth"
  on public.analytics_events
  for select
  to authenticated
  using (true);
