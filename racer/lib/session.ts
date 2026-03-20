import { randomBytes } from "node:crypto";
import { ensureAccountsTable, turso } from "@/lib/turso";

type SessionPayload = {
  accountId: number;
  email: string;
  exp: number;
};

export const SESSION_COOKIE_NAME = "racer_session";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function createSessionToken(accountId: number) {
  await ensureAccountsTable();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;

  await turso.execute({
    sql: "INSERT INTO sessions (id, account_id, expires_at) VALUES (?, ?, ?)",
    args: [token, accountId, expiresAt],
  });

  return token;
}

export async function verifySessionToken(token: string) {
  if (!token) {
    return null;
  }

  await ensureAccountsTable();
  const result = await turso.execute({
    sql: `SELECT s.account_id, s.expires_at, a.email
          FROM sessions s
          INNER JOIN accounts a ON a.id = s.account_id
          WHERE s.id = ?
          LIMIT 1`,
    args: [token],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const email = String(row.email ?? "");
  const accountId = Number(row.account_id ?? 0);
  const exp = Number(row.expires_at ?? 0);

  if (!email || !Number.isInteger(accountId) || accountId <= 0 || !Number.isFinite(exp)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    await turso.execute({
      sql: "DELETE FROM sessions WHERE id = ?",
      args: [token],
    });
    return null;
  }

  const refreshedExp = now + SESSION_DURATION_SECONDS;
  await turso.execute({
    sql: "UPDATE sessions SET expires_at = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [refreshedExp, token],
  });

  return {
    accountId,
    email,
    exp: refreshedExp,
  } satisfies SessionPayload;
}
