begin;
alter table public.allowed_chats add column groups_enabled boolean not null default false;
alter table public.upload_sessions add column root_message_id bigint;
alter table public.upload_sessions add column is_group boolean not null default false;
create table public.input_prompts (
 bot_id uuid not null references public.bot_installations,
 chat_id bigint not null, message_id bigint not null, thread_id bigint not null default 0,
 workspace_id uuid not null, session_id uuid not null, actor_id uuid not null,
 revision integer not null, expires_at timestamptz not null,
 primary key(bot_id,chat_id,message_id),
 foreign key(workspace_id,session_id) references public.upload_sessions(workspace_id,id),
 foreign key(workspace_id,actor_id) references public.telegram_users(workspace_id,id)
);
alter table public.input_prompts enable row level security;
revoke all on public.input_prompts from anon,authenticated;
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.oauth_states (
 state_hash text primary key, workspace_id uuid not null references public.workspaces,
 auth_user_id uuid not null references auth.users, verifier_encrypted text not null,
 expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now()
);
create table private.google_credentials (
 workspace_id uuid primary key references public.workspaces,
 refresh_token_encrypted text not null, scopes text not null,
 connected_by uuid not null references auth.users, updated_at timestamptz not null default now()
);
revoke all on all tables in schema private from public,anon,authenticated;
alter table private.oauth_states enable row level security;
alter table private.google_credentials enable row level security;
commit;
