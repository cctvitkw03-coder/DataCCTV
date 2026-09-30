import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { db, transaction } from "./db";
import { encrypt, decrypt } from "./crypto";
import { HttpError } from "./auth";
export const OAUTH_COOKIE = "drive_oauth_state";
const scope = "https://www.googleapis.com/auth/drive.file";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export function oauthClient() {
  const id = process.env.GOOGLE_CLIENT_ID,
    secret = process.env.GOOGLE_CLIENT_SECRET,
    app = process.env.NEXT_PUBLIC_APP_URL;
  if (!id || !secret || !app)
    throw new HttpError(503, "GOOGLE_OAUTH_NOT_CONFIGURED");
  const url = new URL(app);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new HttpError(503, "HTTPS_REQUIRED");
  return new OAuth2Client(
    id,
    secret,
    new URL("/api/auth/google/callback", app).toString(),
  );
}
export async function beginOAuth(workspace: string, user: string) {
  const client = oauthClient();
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await db().query(
    "insert into private.oauth_states(state_hash,workspace_id,auth_user_id,verifier_encrypted,expires_at) values($1,$2,$3,$4,now()+interval '10 minutes')",
    [
      hash(state),
      workspace,
      user,
      encrypt(verifier, `oauth:${workspace}:${user}`),
    ],
  );
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [scope],
    state,
    code_challenge: challenge,
    code_challenge_method:
      "S256" as import("google-auth-library").CodeChallengeMethod,
    include_granted_scopes: false,
  });
  return { state, url };
}
export async function finishOAuth(
  state: string,
  code: string,
  workspace: string,
  user: string,
) {
  const verifier = await transaction(async (c) => {
    const row = (
      await c.query(
        "select * from private.oauth_states where state_hash=$1 for update",
        [hash(state)],
      )
    ).rows[0];
    if (
      !row ||
      row.workspace_id !== workspace ||
      row.auth_user_id !== user ||
      row.consumed_at ||
      new Date(row.expires_at).getTime() < Date.now()
    )
      throw new HttpError(400, "INVALID_OAUTH_STATE");
    await c.query(
      "update private.oauth_states set consumed_at=now() where state_hash=$1",
      [hash(state)],
    );
    return decrypt(row.verifier_encrypted, `oauth:${workspace}:${user}`);
  });
  const { tokens } = await oauthClient().getToken({
    code,
    codeVerifier: verifier,
  });
  if (!tokens.refresh_token)
    throw new HttpError(400, "GOOGLE_REFRESH_TOKEN_MISSING");
  if (!tokens.scope?.split(" ").includes(scope))
    throw new HttpError(400, "GOOGLE_SCOPE_MISSING");
  await transaction(async (c) => {
    await c.query(
      "insert into private.google_credentials(workspace_id,refresh_token_encrypted,scopes,connected_by) values($1,$2,$3,$4) on conflict(workspace_id) do update set refresh_token_encrypted=excluded.refresh_token_encrypted,scopes=excluded.scopes,connected_by=excluded.connected_by,updated_at=now()",
      [
        workspace,
        encrypt(tokens.refresh_token!, `google:${workspace}`),
        tokens.scope,
        user,
      ],
    );
    await c.query(
      "insert into audit_logs(workspace_id,actor_type,actor_id,action) values($1,'dashboard',$2,'google_connected')",
      [workspace, user],
    );
  });
}
export async function storedRefreshToken() {
  const row = (
    await db().query(
      "select refresh_token_encrypted from private.google_credentials where workspace_id=$1",
      [process.env.APP_WORKSPACE_ID],
    )
  ).rows[0];
  return row
    ? decrypt(
        row.refresh_token_encrypted,
        `google:${process.env.APP_WORKSPACE_ID}`,
      )
    : process.env.GOOGLE_REFRESH_TOKEN;
}
