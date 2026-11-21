import { getToken } from "next-auth/jwt";
import { type NextRequest, NextResponse } from "next/server";

import { isAllowedEmail } from "@/lib/server/auth";
import { getSecrets } from "@/lib/server/secrets";

/**
 * Proxy (ex-middleware) exécuté avant chaque page :
 * - session obligatoire, adresse revérifiée contre la liste blanche à chaque requête ;
 * - CSP par nonce : seuls les scripts émis par Next.js pour cette réponse s'exécutent.
 */

const PUBLIC_PATHS = ["/login"];

export function buildContentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

type Deps = {
  auth: () => Promise<{ secret: string; adminEmails: string[] }>;
  getToken: typeof getToken;
  nonce: () => string;
};

export function createProxy(deps: Deps) {
  return async function proxy(request: NextRequest): Promise<NextResponse> {
    const { pathname, search } = request.nextUrl;
    const nonce = deps.nonce();
    const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

    if (!PUBLIC_PATHS.includes(pathname)) {
      const auth = await deps.auth();
      const token = await deps.getToken({ req: request, secret: auth.secret });
      if (!token || !isAllowedEmail(token.email, auth.adminEmails)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: { code: "AUTHENTICATION_REQUIRED", message: "Connexion requise." } },
            { status: 401 },
          );
        }
        const login = new URL("/login", request.url);
        if (token) login.searchParams.set("error", "AccessDenied");
        else login.searchParams.set("callbackUrl", `${pathname}${search}`);
        return NextResponse.redirect(login);
      }
    }

    // Next.js lit la CSP de la requête pour poser le nonce sur ses propres scripts.
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };
}

export const proxy = createProxy({
  auth: async () => (await getSecrets()).auth,
  getToken,
  nonce: () => Buffer.from(crypto.randomUUID()).toString("base64"),
});

export const config = {
  // Ni les fichiers statiques ni les routes de NextAuth (qui gèrent elles-mêmes la connexion).
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
