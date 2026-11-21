"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionError, toActionError } from "@/lib/api-errors";
import { requireAdmin } from "@/lib/server/auth";
import { parseServiceForm, type ServicePayload, services } from "@/lib/server/services";

/**
 * Actions serveur des services. Appelables directement en POST : la session admin est revérifiée
 * à chaque appel (le proxy filtre aussi), les identifiants reçus du navigateur sont validés.
 * Les secrets (clé API, secret webhook) ne transitent qu'une fois, dans la réponse de l'action.
 */

export type ServiceFormState =
  | { status: "idle" }
  | { status: "error"; error: ActionError }
  | { status: "saved" }
  | { status: "created"; id: string; name: string; apiKey: string; webhookSecret: string };

export type CredentialState =
  | { status: "idle" }
  | { status: "error"; error: ActionError }
  | { status: "done"; secret?: string; expiresAt?: string | null; message: string };

const invalid = (fieldErrors: Record<string, string>): ServiceFormState => ({
  status: "error",
  error: { message: "Certains champs sont invalides.", fieldErrors, requestId: null },
});

function idempotencyKey(form: FormData): string {
  const value = form.get("idempotency_key");
  return typeof value === "string" && z.uuid().safeParse(value).success
    ? value
    : crypto.randomUUID();
}

/** À la création, le contrat n'accepte pas `null` pour les champs facultatifs : ils sont omis. */
function withoutNulls(payload: ServicePayload): Partial<ServicePayload> {
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null));
}

export async function createServiceAction(
  _previous: ServiceFormState,
  form: FormData,
): Promise<ServiceFormState> {
  await requireAdmin();
  const parsed = parseServiceForm(form);
  if (!parsed.ok) return invalid(parsed.errors);
  try {
    const created = await services.create(withoutNulls(parsed.value), idempotencyKey(form));
    revalidatePath("/services");
    return {
      status: "created",
      id: created.id,
      name: created.name,
      apiKey: created.api_key,
      webhookSecret: created.webhook_secret,
    };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}

export async function updateServiceAction(
  serviceId: string,
  _previous: ServiceFormState,
  form: FormData,
): Promise<ServiceFormState> {
  await requireAdmin();
  const parsed = parseServiceForm(form);
  if (!parsed.ok) return invalid(parsed.errors);
  try {
    await services.update(serviceId, parsed.value);
    revalidatePath(`/services/${serviceId}`);
    revalidatePath("/services");
    return { status: "saved" };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}

export async function setServiceStatusAction(
  serviceId: string,
  _previous: CredentialState,
  form: FormData,
): Promise<CredentialState> {
  await requireAdmin();
  const status = form.get("status");
  if (status !== "active" && status !== "disabled") {
    return { status: "error", error: toActionError(null) };
  }
  try {
    await services.update(serviceId, { status });
    revalidatePath(`/services/${serviceId}`);
    revalidatePath("/services");
    return {
      status: "done",
      message: status === "active" ? "Service réactivé." : "Service désactivé : ses appels sont refusés.",
    };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}

export async function rotateApiKeyAction(
  serviceId: string,
  _previous: CredentialState,
  form: FormData,
): Promise<CredentialState> {
  await requireAdmin();
  const grace = z.coerce.number().int().min(0).max(72).safeParse(form.get("grace_period_hours"));
  if (!grace.success) return { status: "error", error: toActionError(null) };
  try {
    const rotated = await services.rotateApiKey(serviceId, grace.data, idempotencyKey(form));
    revalidatePath(`/services/${serviceId}`);
    return {
      status: "done",
      secret: rotated.api_key,
      expiresAt: rotated.previous_key_expires_at,
      message: "Nouvelle clé API générée.",
    };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}

export async function rotateWebhookSecretAction(
  serviceId: string,
  _previous: CredentialState,
  form: FormData,
): Promise<CredentialState> {
  await requireAdmin();
  try {
    const rotated = await services.rotateWebhookSecret(serviceId, idempotencyKey(form));
    revalidatePath(`/services/${serviceId}`);
    return {
      status: "done",
      secret: rotated.webhook_secret,
      expiresAt: rotated.previous_secret_expires_at,
      message: "Nouveau secret webhook généré.",
    };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}
