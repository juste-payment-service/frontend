import { describe, expect, it } from "vitest";

import {
  checkFileLimit,
  MAX_SUBJECT_LENGTH,
  validateBranchName,
  validateCommitMessage,
} from "./git-guards.mjs";

describe("nom de branche", () => {
  it.each(["feat/admin-services", "fix/login-redirect", "ci/deploy-vercel", "main"])(
    "accepte %s",
    (name) => expect(validateBranchName(name)).toBeNull(),
  );

  it.each(["feature/x", "feat/Admin", "feat:admin", "feat/admin_services", "feat/", "dev"])(
    "refuse %s",
    (name) => expect(validateBranchName(name)).toMatch(/Nom de branche invalide/),
  );
});

describe("message de commit", () => {
  it("accepte le format du projet", () => {
    expect(validateCommitMessage("feat(admin-services): liste des services\n")).toBeNull();
  });

  it("accepte un corps séparé par une ligne vide", () => {
    expect(validateCommitMessage("fix(login): corrige le retour\n\nDétails.\n")).toBeNull();
  });

  it("ignore les commentaires git et les fusions", () => {
    expect(validateCommitMessage("# commentaire\nchore(bootstrap): socle\n")).toBeNull();
    expect(validateCommitMessage("Merge pull request #3 from x/y\n")).toBeNull();
  });

  it.each([
    "ajout de la liste",
    "feat: sans cas d'usage",
    "feat(Admin): majuscule",
    "feature(admin): type inconnu",
    "feat(admin):sans espace",
  ])("refuse %s", (message) => {
    expect(validateCommitMessage(message)).toMatch(/Message de commit invalide/);
  });

  it("refuse un sujet trop long", () => {
    const subject = `feat(admin): ${"x".repeat(MAX_SUBJECT_LENGTH)}`;
    expect(validateCommitMessage(subject)).toMatch(/Sujet trop long/);
  });

  it("exige une ligne vide entre le sujet et le corps", () => {
    expect(validateCommitMessage("feat(admin): sujet\ncorps collé\n")).toMatch(/ligne vide/);
  });
});

describe("limite de fichiers", () => {
  it("accepte jusqu'à la limite", () => {
    expect(checkFileLimit(new Set(["a", "b"]), 2)).toBeNull();
  });

  it("liste les fichiers au-delà de la limite", () => {
    const error = checkFileLimit(new Set(["b", "a", "c"]), 2);
    expect(error).toMatch(/3 fichiers modifiés/);
    expect(error).toMatch(/- a\n {2}- b\n {2}- c/);
  });
});
