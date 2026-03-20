import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/session";
import { ensureAccountsTable, turso } from "@/lib/turso";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as LoginBody;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  await ensureAccountsTable();

  const result = await turso.execute({
    sql: "SELECT id, email, password_hash FROM accounts WHERE email = ? LIMIT 1",
    args: [email],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const account = result.rows[0];
  const storedHash = account.password_hash;

  if (typeof storedHash !== "string" || !verifyPassword(password, storedHash)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const accountId = Number(account.id ?? 0);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return NextResponse.json({ error: "Invalid account record." }, { status: 500 });
  }

  const sessionToken = await createSessionToken(accountId);
  const response = NextResponse.json({
    message: "Login successful.",
    accountId,
    redirectTo: "/account",
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
