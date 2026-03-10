import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { ensureAccountsTable, turso } from "@/lib/turso";

type SignupBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SignupBody;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  await ensureAccountsTable();

  try {
    await turso.execute({
      sql: "INSERT INTO accounts (email, password_hash) VALUES (?, ?)",
      args: [email, hashPassword(password)],
    });

    return NextResponse.json({ message: "Account created successfully." });
  } catch (error) {
    const details = String(error);

    if (details.includes("UNIQUE constraint failed")) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}
