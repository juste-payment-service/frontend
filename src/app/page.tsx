import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { getAdminSession } from "@/lib/server/auth";

export default async function HomePage() {
  const session = await getAdminSession();
  if (!session) redirect("/login"); // défense en profondeur : le proxy filtre déjà

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-4 px-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">Payment Service</p>
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
          <span>{session.user?.email}</span>
          <SignOutButton />
        </div>
      </div>
      <h1 className="text-3xl font-semibold">Console d&apos;administration</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Connexion en place. Les écrans de gestion arrivent dans les prochaines branches.
      </p>
    </main>
  );
}
