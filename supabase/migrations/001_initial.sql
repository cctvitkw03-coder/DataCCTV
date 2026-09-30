begin;
create table public.workspaces (id uuid primary key default gen_random_uuid(), name text not null, timezone text not null default 'Asia/Bangkok', drive_root_folder_id text unique not null, created_at timestamptz not null default now());
create table public.workspace_members (workspace_id uuid references public.workspaces, auth_user_id uuid references auth.users, role text not null check(role in ('viewer','operator','admin')), primary key(workspace_id,auth_user_id));
create table public.bot_installations (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, telegram_bot_id bigint unique not null, enabled boolean not null default true, unique(workspace_id,id));
create table public.allowed_chats (bot_id uuid references public.bot_installations, telegram_chat_id bigint, enabled boolean not null default true, primary key(bot_id,telegram_chat_id));
create table public.telegram_users (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, bot_id uuid not null, telegram_user_id bigint not null, username text, display_name text, last_seen_at timestamptz not null default now(), foreign key(workspace_id,bot_id) references public.bot_installations(workspace_id,id), unique(bot_id,telegram_user_id), unique(workspace_id,id));
create table public.user_folders (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, display_name text not null, normalized_name text not null, drive_folder_id text unique, status text not null default 'pending' check(status in ('pending','ready','missing','blocked')), created_at timestamptz not null default now(), unique(workspace_id,normalized_name), unique(workspace_id,id));
create table public.user_preferences (workspace_id uuid not null, telegram_user_pk uuid not null, last_user_folder_id uuid not null, selected_at timestamptz not null default now(), primary key(workspace_id,telegram_user_pk), foreign key(workspace_id,telegram_user_pk) references public.telegram_users(workspace_id,id), foreign key(workspace_id,last_user_folder_id) references public.user_folders(workspace_id,id));
create table public.job_types (workspace_id uuid references public.workspaces, code text check(code in ('MOUSE_KEYBOARD','UPS')), label text not null, primary key(workspace_id,code));
create table public.system_types (code text primary key check(code in ('CCTV','QUARK')), label text not null);
insert into public.system_types values ('CCTV','CCTV'),('QUARK','QUARK');
create table public.branches (id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces,code text not null,label text not null,enabled boolean not null default true,unique(workspace_id,code));
create table public.drive_nodes (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, node_key text not null, parent_drive_id text not null, drive_folder_id text not null unique, name text not null, status text not null default 'pending', unique(workspace_id,node_key));
create table public.upload_sessions (
 id uuid primary key default gen_random_uuid(),session_no bigint generated always as identity unique,workspace_id uuid not null,bot_id uuid not null,actor_id uuid not null,chat_id bigint not null,thread_id bigint not null default 0,
 state text not null default 'collecting' check(state in ('collecting','configuring','preview','queued','provisioning','uploading','retry_wait','partial','completed','failed','cancelled','expired','stopped')),
 step text not null default 'folder', revision integer not null default 0, draft jsonb not null default '{}', snapshot jsonb, work_date date, expected_file_count integer, work_folder_drive_id text unique, stop_requested boolean not null default false,
 expires_at timestamptz not null default now()+interval '24 hours',last_activity_at timestamptz not null default now(),created_at timestamptz not null default now(),confirmed_at timestamptz,completed_at timestamptz,last_error_code text,
 foreign key(workspace_id,bot_id) references public.bot_installations(workspace_id,id), foreign key(workspace_id,actor_id) references public.telegram_users(workspace_id,id),unique(workspace_id,id));
create unique index one_editable_context on public.upload_sessions(bot_id,chat_id,thread_id,actor_id) where state in ('collecting','configuring','preview');
create index sessions_dashboard on public.upload_sessions(workspace_id,work_date desc,state);
create table public.session_files (id uuid primary key default gen_random_uuid(),workspace_id uuid not null,session_id uuid not null,bot_id uuid not null,chat_id bigint not null,message_id bigint not null,media_group_id text,telegram_file_id text not null,unique_id text not null,mime text not null check(mime in ('image/jpeg','image/png','image/webp')),size bigint not null check(size>=0),original_filename text,sequence integer,target_name text,drive_file_id text unique,sha256 text,status text not null default 'pending' check(status in ('pending','uploaded','failed','retry','skipped')),attempts integer not null default 0,last_error_code text,uploaded_at timestamptz,created_at timestamptz not null default now(),foreign key(workspace_id,session_id) references public.upload_sessions(workspace_id,id),foreign key(workspace_id,bot_id) references public.bot_installations(workspace_id,id),unique(bot_id,chat_id,message_id),unique(session_id,sequence));
create index files_pending on public.session_files(session_id,status);
create table public.telegram_updates (bot_id uuid references public.bot_installations,update_id bigint,payload jsonb not null,status text not null default 'queued',attempts integer not null default 0,run_after timestamptz not null default now(),last_error_code text,received_at timestamptz not null default now(),processed_at timestamptz,primary key(bot_id,update_id));
create table public.callback_tokens (token_hash text primary key,workspace_id uuid not null,session_id uuid not null,actor_id uuid not null,chat_id bigint not null,thread_id bigint not null,action text not null,argument text,expected_revision integer not null,expires_at timestamptz not null,consumed_at timestamptz,foreign key(workspace_id,session_id) references public.upload_sessions(workspace_id,id));
create table public.jobs (id uuid primary key default gen_random_uuid(),workspace_id uuid not null,session_id uuid not null,kind text not null default 'upload',dedupe_key text unique not null,status text not null default 'queued' check(status in ('queued','running','retry','done','dead')),run_after timestamptz not null default now(),attempts integer not null default 0,lease_owner uuid,lease_until timestamptz,lease_generation integer not null default 0,last_error_code text,created_at timestamptz not null default now(),foreign key(workspace_id,session_id) references public.upload_sessions(workspace_id,id));
create index jobs_ready on public.jobs(run_after,created_at) where status in ('queued','retry','running');
create table public.notification_outbox (id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces,session_id uuid references public.upload_sessions,event_key text unique not null,chat_id bigint not null,payload jsonb not null,status text not null default 'queued',attempts integer not null default 0,run_after timestamptz not null default now(),created_at timestamptz not null default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces,actor_type text not null,actor_id text not null,action text not null,entity_id uuid,safe_metadata jsonb not null default '{}',created_at timestamptz not null default now());
create table public.mutation_keys (workspace_id uuid not null references public.workspaces,actor_id uuid not null,key text not null,action text not null,session_id uuid not null,primary key(workspace_id,actor_id,key));

create function public.member_role(w uuid) returns text language sql stable security definer set search_path = '' as $$ select role from public.workspace_members where workspace_id=w and auth_user_id=(select auth.uid()) $$;
revoke all on function public.member_role(uuid) from public;
grant execute on function public.member_role(uuid) to authenticated;
do $$ declare t text; begin
 foreach t in array array['workspaces','workspace_members','bot_installations','allowed_chats','telegram_users','user_folders','user_preferences','job_types','system_types','branches','drive_nodes','upload_sessions','session_files','telegram_updates','callback_tokens','jobs','notification_outbox','audit_logs','mutation_keys'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
 foreach t in array array['user_folders','job_types','branches','drive_nodes','upload_sessions','session_files'] loop
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy member_read on public.%I for select to authenticated using (public.member_role(workspace_id) is not null)',t);
 end loop;
 foreach t in array array['telegram_users','user_preferences','audit_logs'] loop
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy operator_read on public.%I for select to authenticated using (public.member_role(workspace_id) in (''admin'',''operator''))',t);
 end loop;
end $$;
grant select on public.workspaces,public.workspace_members,public.system_types to authenticated;
create policy workspace_read on public.workspaces for select to authenticated using(public.member_role(id) is not null);
create policy own_membership on public.workspace_members for select to authenticated using(auth_user_id=(select auth.uid()));
create policy system_read on public.system_types for select to authenticated using(exists(select 1 from public.workspace_members where auth_user_id=(select auth.uid())));

create function public.protect_snapshot() returns trigger language plpgsql set search_path='' as $$ begin
 if old.snapshot is not null and (new.snapshot is distinct from old.snapshot or new.draft is distinct from old.draft or new.work_date is distinct from old.work_date or new.expected_file_count is distinct from old.expected_file_count) then raise exception 'IMMUTABLE_SNAPSHOT'; end if;
 if old.work_folder_drive_id is not null and new.work_folder_drive_id is distinct from old.work_folder_drive_id then raise exception 'IMMUTABLE_DRIVE_ID'; end if; return new; end $$;
create trigger protect_snapshot before update on public.upload_sessions for each row execute function public.protect_snapshot();
create function public.protect_file() returns trigger language plpgsql set search_path='' as $$ begin
 if old.drive_file_id is not null and new.drive_file_id is distinct from old.drive_file_id then raise exception 'IMMUTABLE_DRIVE_ID'; end if;
 if old.sequence is not null and (new.sequence is distinct from old.sequence or new.target_name is distinct from old.target_name or new.telegram_file_id is distinct from old.telegram_file_id or new.session_id is distinct from old.session_id) then raise exception 'IMMUTABLE_FILE'; end if; return new; end $$;
create trigger protect_file before update on public.session_files for each row execute function public.protect_file();
revoke all on function public.protect_snapshot(),public.protect_file() from public;
commit;
