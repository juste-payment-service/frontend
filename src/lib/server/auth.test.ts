import type { Account, Profile, User } from "next-auth";
import { describe, expect, it } from "vitest";

import { buildAuthOptions, isAllowedEmail } from "./auth";

const AUTH = {
  secret: "s".repeat(48),
  googleId: "1234-abc.apps.googleusercontent.com",
  googleSecret: "GOCSPX-abcdefghijkl",
  adminEmails: ["admin@mrjuste.online"],
};

describe("liste blanche", () => {
  it("compare les adresses sans tenir compte de la casse", () => {
    expect(isAllowedEmail(" Admin@MrJuste.online ", AUTH.adminEmails)).toBe(true);
  });

  it.each([undefined, null, "", "intrus@mrjuste.online", "admin@mrjuste.online.evil.com"])(
    "refuse %s",
    (email) => expect(isAllowedEmail(email, AUTH.adminEmails)).toBe(false),
  );
});

describe("options de connexion", () => {
  const options = buildAuthOptions(AUTH);
  const signIn = (profile: Partial<Profile> & { email_verified?: boolean }, provider = "google") =>
    options.callbacks!.signIn!({
      user: { id: "1", email: profile.email } as User,
      account: { provider, type: "oauth", providerAccountId: "1" } as Account,
      profile: profile as Profile,
    });

  it("n'accepte que Google", () => {
    expect(options.providers.map((p) => p.id)).toEqual(["google"]);
  });

  it("accepte une adresse Google vérifiée et autorisée", async () => {
    await expect(signIn({ email: "admin@mrjuste.online", email_verified: true })).resolves.toBe(
      true,
    );
  });

  it.each([
    [{ email: "intrus@gmail.com", email_verified: true }, "google"],
    [{ email: "admin@mrjuste.online", email_verified: false }, "google"],
    [{ email: "admin@mrjuste.online" }, "google"],
    [{ email: "admin@mrjuste.online", email_verified: true }, "github"],
  ])("refuse %o via %s", async (profile, provider) => {
    await expect(signIn(profile, provider)).resolves.toBe(false);
  });

  it("garde une session courte, signée par le secret Doppler", () => {
    expect(options.session?.strategy).toBe("jwt");
    expect(options.session?.maxAge).toBe(8 * 60 * 60);
    expect(options.secret).toBe(AUTH.secret);
    expect(options.pages).toEqual({ signIn: "/login", error: "/login" });
  });

  it("propose toujours le choix du compte Google", () => {
    const google = options.providers[0] as unknown as {
      options: { authorization: { params: Record<string, string> } };
    };
    expect(google.options.authorization.params.prompt).toBe("select_account");
  });
});
