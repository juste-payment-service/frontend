import { describe, expect, it } from "vitest";

import { toActionError } from "./api-errors";

describe("erreurs de l'API pour l'interface", () => {
  it("traduit le code et rattache les détails aux champs", () => {
    expect(
      toActionError({
        code: "VALIDATION_ERROR",
        message: "La requête contient des champs invalides.",
        details: [
          { field: "body.name", message: "Trop court." },
          { field: "transfer_limits.max_amount", message: "Doit être positif." },
        ],
        requestId: "req_1",
      }),
    ).toEqual({
      message: "Certains champs sont invalides.",
      fieldErrors: { name: "Trop court.", max_amount: "Doit être positif." },
      requestId: "req_1",
    });
  });

  it("garde le message de l'API pour un code inconnu", () => {
    expect(toActionError({ code: "NOUVEAU", message: "Message API." }).message).toBe("Message API.");
  });

  it("n'expose jamais le détail d'une erreur inattendue", () => {
    expect(toActionError(new TypeError("détail interne"))).toEqual({
      message: "Erreur inattendue. Réessayez.",
      fieldErrors: {},
      requestId: null,
    });
  });
});
