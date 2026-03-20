import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { AuthorizedTopNav } from "./authorized-top-nav";
import { EventsManager } from "./events-manager";

export default async function AccountPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <AuthorizedTopNav />
      <div className="mx-auto w-full max-w-2xl p-6">
        <EventsManager />
      </div>
    </main>
  );
}
