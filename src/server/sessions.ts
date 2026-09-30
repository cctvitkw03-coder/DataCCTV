import "server-only";
import { db, transaction } from "./db";
import { HttpError, membership } from "./auth";
export async function listSessions() {
  const a = await membership();
  const rows = await db().query(
    "select s.id,s.session_no,s.state,s.work_date,s.created_at,s.confirmed_at,s.completed_at,s.draft,s.work_folder_drive_id,s.expected_file_count,u.username,u.display_name,(select count(*) from session_files f where f.session_id=s.id) as total,(select count(*) from session_files f where f.session_id=s.id and f.status='uploaded') as uploaded from upload_sessions s join telegram_users u on u.id=s.actor_id where s.workspace_id=$1 order by s.created_at desc limit 200",
    [a.workspace],
  );
  return { rows: rows.rows, role: a.role };
}
export async function detailSession(id: string) {
  const a = await membership();
  const s = (
    await db().query(
      "select * from upload_sessions where id=$1 and workspace_id=$2",
      [id, a.workspace],
    )
  ).rows[0];
  if (!s) throw new HttpError(404, "NOT_FOUND");
  const files = (
    await db().query(
      "select id,sequence,target_name,mime,size,status,attempts,last_error_code,drive_file_id from session_files where session_id=$1 and workspace_id=$2 order by sequence nulls last,message_id",
      [id, a.workspace],
    )
  ).rows;
  const audit = (
    await db().query(
      "select action,actor_type,actor_id,created_at from audit_logs where entity_id=$1 and workspace_id=$2 order by created_at",
      [id, a.workspace],
    )
  ).rows;
  return { session: s, files, audit };
}
export async function changeSession(
  id: string,
  action: "retry" | "stop",
  key: string,
) {
  const a = await membership("operator");
  return transaction(async (c) => {
    const s = (
      await c.query(
        "select * from upload_sessions where id=$1 and workspace_id=$2 for update",
        [id, a.workspace],
      )
    ).rows[0];
    if (!s) throw new HttpError(404, "NOT_FOUND");
    const old = (
      await c.query(
        "select * from mutation_keys where workspace_id=$1 and actor_id=$2 and key=$3",
        [a.workspace, a.userId, key],
      )
    ).rows[0];
    if (old) {
      if (old.session_id !== id || old.action !== action)
        throw new HttpError(409, "KEY_CONFLICT");
      return { ok: true };
    }
    if (action === "retry") {
      if (!["failed", "partial"].includes(s.state))
        throw new HttpError(409, "INVALID_STATE");
      await c.query(
        "update upload_sessions set state='queued',stop_requested=false where id=$1",
        [id],
      );
      await c.query(
        "update jobs set status='queued',attempts=0,run_after=now(),lease_until=null,lease_generation=lease_generation+1 where session_id=$1",
        [id],
      );
    } else {
      if (
        ![
          "queued",
          "provisioning",
          "uploading",
          "retry_wait",
          "partial",
          "failed",
        ].includes(s.state)
      )
        throw new HttpError(409, "INVALID_STATE");
      await c.query(
        "update upload_sessions set stop_requested=true where id=$1",
        [id],
      );
      await c.query(
        "update jobs set status=case when status='running' then status else 'queued' end,run_after=now() where session_id=$1",
        [id],
      );
    }
    await c.query("insert into mutation_keys values($1,$2,$3,$4,$5)", [
      a.workspace,
      a.userId,
      key,
      action,
      id,
    ]);
    await c.query(
      "insert into audit_logs(workspace_id,actor_type,actor_id,action,entity_id) values($1,'dashboard',$2,$3,$4)",
      [a.workspace, a.userId, action, id],
    );
    return { ok: true };
  });
}
