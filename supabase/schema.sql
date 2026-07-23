-- Run this once in Supabase Dashboard > SQL Editor.
create table if not exists public.canvases (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled canvas',
  payload jsonb not null default '{}'::jsonb,
  object_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.canvases enable row level security;

drop policy if exists "Users can read their canvases" on public.canvases;
create policy "Users can read their canvases"
on public.canvases for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their canvases" on public.canvases;
create policy "Users can create their canvases"
on public.canvases for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their canvases" on public.canvases;
create policy "Users can update their canvases"
on public.canvases for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their canvases" on public.canvases;
create policy "Users can delete their canvases"
on public.canvases for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.canvases to authenticated;
-- Allows an authenticated user to permanently remove only their own account.
-- Their canvases are removed automatically by the foreign key above.
create or replace function public.delete_own_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
