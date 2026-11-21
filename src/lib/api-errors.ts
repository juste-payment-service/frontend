/**
 * Erreurs de l'API traduites pour l'interface : on branche la logique sur `code` (contrat),
 * jamais sur le message. Le `requestId` est affiché pour faciliter le support.
 */

export type ActionError = {
  message: string;
  fieldErrors: Record<string, string>;
  requestId: string | null;
};

const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Certains champs sont invalides.",
  SERVICE_NAME_TAKEN: "Un service porte déjà ce nom.",
  NOT_FOUND: "Élément introuvable (supprimé ou identifiant erroné).",
  REQUEST_IN_PROGRESS: "Une demande identique est en cours ; réessayez dans quelques secondes.",
  IDEMPOTENCY_KEY_REUSED: "Cette opération a déjà été envoyée avec d'autres valeurs : rechargez la page.",
  AUTHENTICATION_REQUIRED: "La console n'est pas autorisée par l'API (clé admin).",
  INVALID_API_KEY: "La console n'est pas autorisée par l'API (clé admin).",
  RATE_LIMITED: "Trop de requêtes : patientez un instant.",
  TRANSFER_NOT_ACTIONABLE: "Action impossible dans l'état actuel du transfert.",
  REVIEW_ALREADY_RESOLVED: "Ce dossier a déjà été clos : rechargez la page.",
  PROVIDER_UNAVAILABLE: "Le prestataire de paiement est momentanément indisponible.",
  PROVIDER_TIMEOUT: "Le prestataire de paiement n'a pas répondu à temps.",
  PROVIDER_ERROR: "Erreur du prestataire de paiement.",
  INVALID_PHONE_NUMBER: "Numéro de téléphone refusé par le prestataire.",
  CUSTOMER_DETAILS_REQUIRED: "Nom, e-mail et téléphone du client sont requis pour une carte.",
  PROVIDER_INSUFFICIENT_FUNDS: "Solde insuffisant chez le prestataire.",
  NETWORK_ERROR: "API injoignable. Vérifiez qu'elle est en ligne.",
  TIMEOUT: "L'API n'a pas répondu à temps.",
  INVALID_RESPONSE: "Réponse inattendue de l'API (version du contrat ?).",
  UNEXPECTED_RESPONSE: "Réponse inattendue de l'API.",
};

type ApiErrorLike = {
  code: string;
  message: string;
  details?: { field?: string; message?: string }[];
  requestId?: string | null;
};

function isApiErrorLike(error: unknown): error is ApiErrorLike {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

export function toActionError(error: unknown): ActionError {
  if (!isApiErrorLike(error)) {
    return { message: "Erreur inattendue. Réessayez.", fieldErrors: {}, requestId: null };
  }
  const fieldErrors: Record<string, string> = {};
  for (const detail of error.details ?? []) {
    // Le contrat nomme le champ (`name`, `body.name`, `transfer_limits.max_amount`) : dernier segment.
    const field = detail.field?.split(".").pop();
    if (field && detail.message) fieldErrors[field] ??= detail.message;
  }
  return {
    message: MESSAGES[error.code] ?? error.message ?? "Erreur de l'API.",
    fieldErrors,
    requestId: error.requestId ?? null,
  };
}
