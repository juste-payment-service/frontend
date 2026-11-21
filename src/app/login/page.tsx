import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/server/auth";

import { SignInButton } from "./sign-in-button";

export const metadata: Metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  AccessDenied: "Cette adresse Google n'est pas autorisée à accéder à la console.",
  OAuthCallback: "La connexion avec Google a échoué. Réessayez.",
  SessionRequired: "Connectez-vous pour continuer.",
};

/** Retour après connexion : uniquement un chemin interne (pas de redirection ouverte). */
function safeCallback(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")
    ? path
    : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);
  if (await getAdminSession()) redirect(callbackUrl);
  const code = typeof params.error === "string" ? params.error : undefined;
  const error = code ? (ERRORS[code] ?? "La connexion a échoué. Réessayez.") : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">Payment Service</p>
        <h1 className="text-2xl font-semibold">Console d&apos;administration</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Accès réservé aux adresses Google autorisées.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}
      <SignInButton callbackUrl={callbackUrl} />
    </main>
  );
}
