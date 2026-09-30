import "server-only";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { createHash } from "node:crypto";
import { RemoteError } from "./telegram";
import { storedRefreshToken } from "./oauth";
export const FOLDER = "application/vnd.google-apps.folder";
export interface Resource {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  trashed?: boolean;
  size?: string;
  md5Checksum?: string;
  appProperties?: Record<string, string>;
  capabilities?: { canAddChildren?: boolean };
  driveId?: string;
}
export interface Drive {
  generateId(): Promise<string>;
  get(id: string): Promise<Resource | null>;
  ensure(resource: Resource, bytes?: Buffer): Promise<void>;
  validateParent(id: string): Promise<void>;
}
export function verifyResource(
  actual: Resource,
  expected: Resource,
  bytes?: Buffer,
) {
  if (
    actual.trashed ||
    actual.mimeType !== expected.mimeType ||
    actual.parents?.[0] !== expected.parents?.[0] ||
    Object.entries(expected.appProperties || {}).some(
      ([k, v]) => actual.appProperties?.[k] !== v,
    ) ||
    (bytes &&
      (Number(actual.size) !== bytes.length ||
        actual.md5Checksum !== createHash("md5").update(bytes).digest("hex")))
  )
    throw new Error("DRIVE_RESOURCE_MISMATCH");
}
export class GoogleDrive implements Drive {
  private auth;
  private credentialsLoaded = false;
  constructor() {
    if (process.env.GOOGLE_DRIVE_AUTH_MODE === "service_account") {
      if (!process.env.GOOGLE_SHARED_DRIVE_ID)
        throw new Error("SHARED_DRIVE_REQUIRED");
      this.auth = new GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
            /\\n/g,
            "\n",
          ),
        },
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });
    } else {
      const oauth = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
      );
      oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
      this.auth = oauth;
    }
  }
  private async request(path: string, init: RequestInit = {}) {
    if (!this.credentialsLoaded && this.auth instanceof OAuth2Client) {
      const token = await storedRefreshToken();
      if (!token) throw new Error("GOOGLE_AUTH_REQUIRED");
      this.auth.setCredentials({ refresh_token: token });
      this.credentialsLoaded = true;
    }
    const access = await this.auth.getAccessToken();
    const token = typeof access === "string" ? access : access?.token;
    if (!token) throw new Error("GOOGLE_AUTH_REQUIRED");
    const r = await fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      let reason = "DRIVE_ERROR";
      try {
        reason = (await r.json()).error?.errors?.[0]?.reason || reason;
      } catch {}
      throw new RemoteError(
        r.status,
        Number(r.headers.get("retry-after") || 0),
        reason,
      );
    }
    return r;
  }
  async generateId() {
    return (
      await (
        await this.request(
          "/drive/v3/files/generateIds?count=1&space=drive&type=files",
        )
      ).json()
    ).ids[0] as string;
  }
  async get(id: string): Promise<Resource | null> {
    try {
      return await (
        await this.request(
          `/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,parents,trashed,size,md5Checksum,appProperties,capabilities,driveId`,
        )
      ).json();
    } catch (e) {
      if (e instanceof RemoteError && e.status === 404) return null;
      throw e;
    }
  }
  async validateParent(id: string) {
    let current = id;
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) {
      if (seen.has(current)) throw new Error("DRIVE_ANCESTRY");
      seen.add(current);
      const r = await this.get(current);
      if (!r || r.trashed || r.mimeType !== FOLDER)
        throw new Error("DRIVE_PARENT_UNAVAILABLE");
      if (i === 0 && !r.capabilities?.canAddChildren)
        throw new Error("DRIVE_NOT_WRITABLE");
      if (current === process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
        if (
          process.env.GOOGLE_DRIVE_AUTH_MODE === "service_account" &&
          r.driveId !== process.env.GOOGLE_SHARED_DRIVE_ID
        )
          throw new Error("WRONG_SHARED_DRIVE");
        return;
      }
      if (r.parents?.length !== 1) throw new Error("OUTSIDE_DRIVE_ROOT");
      current = r.parents[0];
    }
    throw new Error("OUTSIDE_DRIVE_ROOT");
  }
  async ensure(resource: Resource, bytes?: Buffer) {
    await this.validateParent(resource.parents![0]);
    const existing = await this.get(resource.id);
    if (existing) {
      verifyResource(existing, resource, bytes);
      return;
    }
    try {
      if (bytes) {
        const boundary = "photo_manager_boundary";
        const body = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(resource)}\r\n--${boundary}\r\nContent-Type: ${resource.mimeType}\r\n\r\n`,
          ),
          bytes,
          Buffer.from(`\r\n--${boundary}--`),
        ]);
        await this.request(
          "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
          {
            method: "POST",
            headers: {
              "content-type": `multipart/related; boundary=${boundary}`,
            },
            body: new Uint8Array(body),
          },
        );
      } else
        await this.request("/drive/v3/files?supportsAllDrives=true", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(resource),
        });
    } catch (e) {
      if (!(e instanceof RemoteError && e.status === 409)) throw e;
    }
    const stored = await this.get(resource.id);
    if (!stored) throw new Error("DRIVE_VERIFY_FAILED");
    verifyResource(stored, resource, bytes);
  }
}
