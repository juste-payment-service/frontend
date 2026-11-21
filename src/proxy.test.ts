import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { buildContentSecurityPolicy, createProxy } from "./proxy";

const AUTH = { secret: "s".repeat(48), adminEmails: ["admin@mrjuste.online"] };

function proxyWith(token: Record<string, unknown> | null) {
  const getToken = vi.fn().mockResolvedValue(token);
  const proxy = createProxy({ auth: async () => AUTH, getToken, nonce: () => "bm9uY2U=" });
  return { proxy, getToken };
}

const request = (path: string) => new NextRequest(new URL(path, "https://console.example.com"));

describe("accès à la console", () => {
  it("redirige vers la connexion sans session, en gardant la page demandée", async () => {
    const { proxy } = proxyWith(null);
    const response = await proxy(request("/services?page=2"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://console.example.com/login?callbackUrl=%2Fservices%3Fpage%3D2",
    );
  });

  it("laisse passer une session dont l'adresse est autorisée", async () => {
    const { proxy, getToken } = proxyWith({ email: "admin@mrjuste.online" });
    const response = await proxy(request("/services"));
    expect(response.status).toBe(200);
    expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secret: AUTH.secret }));
  });

  it("révoque une session dont l'adresse a été retirée de la liste blanche", async () => {
    const { proxy } = proxyWith({ email: "ancien@mrjuste.online" });
    const response = await proxy(request("/"));
    expect(response.headers.get("location")).toBe(
      "https://console.example.com/login?error=AccessDenied",
    );
  });

  it("répond 401 aux appels d'API sans session au lieu de rediriger", async () => {
    const { proxy } = proxyWith(null);
    const response = await proxy(request("/api/services"));
    expect(response.status).toBe(401);
  });

  it("laisse la page de connexion accessible sans session", async () => {
    const { proxy } = proxyWith(null);
    const response = await proxy(request("/login"));
    expect(response.status).toBe(200);
  });

  it("applique une CSP avec nonce, transmise aussi à Next.js", async () => {
    const { proxy } = proxyWith({ email: "admin@mrjuste.online" });
    const response = await proxy(request("/"));
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("script-src 'self' 'nonce-bm9uY2U=' 'strict-dynamic'");
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });
});

describe("politique de sécurité du contenu", () => {
  it("interdit les ressources tierces et l'intégration en iframe", () => {
    const csp = buildContentSecurityPolicy("abc", false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("autorise eval uniquement en développement (rechargement à chaud)", () => {
    expect(buildContentSecurityPolicy("abc", true)).toContain("'unsafe-eval'");
  });
});
