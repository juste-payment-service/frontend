import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { ConsoleNav } from "@/components/console-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { Alert } from "@/components/ui";
import { api } from "@/lib/server/api-client";
import { getAdminSession } from "@/lib/server/auth";
import { reviews } from "@/lib/server/reviews";

const Readiness = z.object({
  status: z.enum(["ready", "degraded", "not_ready"]),
  provider_mode: z.enum(["test", "live"]).nullable().optional(),
});

/** État de l'API affiché en bandeau : API injoignable, prestataire indisponible, mode sandbox. */
async function apiBanner() {
  try {
    const ready = await api.public("/ready", { schema: Readiness, timeoutMs: 3_000 });
    if (ready.status === "degraded") {
      return <Alert tone="amber">Le prestataire de paiement est indisponible : les nouvelles opérations échouent.</Alert>;
    }
    if (ready.provider_mode === "test") {
      return <Alert tone="blue">Prestataire en mode sandbox : aucun argent réel ne circule.</Alert>;
    }
    return null;
  } catch {
    return <Alert>API injoignable ou non prête : les données affichées peuvent être indisponibles.</Alert>;
  }
}

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/login"); // défense en profondeur : le proxy filtre déjà
  const openReviews = await reviews.openCount().catch(() => null);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold">Payment Service · Console</span>
            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
              <span className="hidden sm:inline">{session.user?.email}</span>
              <SignOutButton />
            </div>
          </div>
          <ConsoleNav openReviews={openReviews} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {await apiBanner()}
        {children}
      </main>
    </div>
  );
}
