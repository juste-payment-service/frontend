import "server-only";

import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { type AuthSecrets, getSecrets } from "./secrets";

/**
 * Connexion à la console : Google uniquement, adresse **vérifiée** et présente dans la liste
 * blanche Doppler (`ADMIN_EMAILS`). Session JWT chiffrée de 8 h ; la liste blanche est revérifiée à
 * chaque requête par le proxy, si bien qu'une adresse retirée perd l'accès sans attendre
 * l'expiration de sa session.
 */

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function isAllowedEmail(email: string | null | undefined, allowlist: readonly string[]) {
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized) && allowlist.includes(normalized as string);
}

export function buildAuthOptions(auth: AuthSecrets): NextAuthOptions {
  return {
    secret: auth.secret,
    providers: [
      GoogleProvider({
        clientId: auth.googleId,
        clientSecret: auth.googleSecret,
        authorization: { params: { prompt: "select_account" } },
      }),
    ],
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: "/login", error: "/login" },
    callbacks: {
      async signIn({ account, profile }) {
        const verified = (profile as { email_verified?: unknown } | undefined)?.email_verified;
        return (
          account?.provider === "google" &&
          verified === true &&
          isAllowedEmail(profile?.email, auth.adminEmails)
        );
      },
    },
  };
}

export async function getAuthOptions(): Promise<NextAuthOptions> {
  return buildAuthOptions((await getSecrets()).auth);
}

/** Session de l'admin connecté (composants serveur, server actions), ou `null`. */
export async function getAdminSession() {
  const [options, secrets] = await Promise.all([getAuthOptions(), getSecrets()]);
  const session = await getServerSession(options);
  return session && isAllowedEmail(session.user?.email, secrets.auth.adminEmails) ? session : null;
}

/** Garde des server actions : elles sont appelables directement en POST, la session est revérifiée. */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session?.user?.email) throw new Error("Session administrateur requise.");
  return session;
}
