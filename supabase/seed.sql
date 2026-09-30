-- Apply ONLY to a sandbox. Replace UUID/root/bot/chat/auth user IDs before running.
-- No production seed and no fabricated authenticated user is created automatically.
-- insert into workspaces(id,name,drive_root_folder_id) values ('WORKSPACE_UUID','งาน IT','SANDBOX_ROOT_ID');
-- insert into bot_installations(workspace_id,telegram_bot_id) values ('WORKSPACE_UUID',BOT_NUMERIC_ID);
-- insert into allowed_chats(bot_id,telegram_chat_id) select id,CHAT_NUMERIC_ID from bot_installations where telegram_bot_id=BOT_NUMERIC_ID;
-- insert into workspace_members values ('WORKSPACE_UUID','INVITED_AUTH_USER_UUID','admin');
insert into public.job_types(workspace_id,code,label) select id,'UPS','เครื่องสำรองไฟ' from public.workspaces on conflict do nothing;
insert into public.job_types(workspace_id,code,label) select id,'MOUSE_KEYBOARD','รายการสาขาซื้อ เมาส์ + คีย์บอร์ด' from public.workspaces on conflict do nothing;
