import "server-only";
import { Pool, type PoolClient } from "pg";
let pool: Pool;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  return (pool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_SSL_CA
        ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") }
        : {}),
    },
    connectionTimeoutMillis: 8000,
    statement_timeout: 15000,
  }));
}
export async function transaction<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
