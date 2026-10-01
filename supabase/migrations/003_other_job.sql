begin;
alter table public.job_types drop constraint job_types_code_check;
alter table public.job_types add constraint job_types_code_check check(code in ('MOUSE_KEYBOARD','UPS','OTHER'));
insert into public.job_types(workspace_id,code,label) select id,'OTHER','อื่น' from public.workspaces on conflict do nothing;
commit;
