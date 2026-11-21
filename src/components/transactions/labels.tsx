import { Badge } from "@/components/ui";

/** Libellés français des valeurs du contrat (statuts, types, moyens, rôles). */

const STATUS = {
  pending: { label: "En attente", tone: "amber" },
  succeeded: { label: "Réussie", tone: "green" },
  failed: { label: "Échouée", tone: "red" },
  expired: { label: "Expirée", tone: "gray" },
} as const;

export const TYPE_LABELS: Record<string, string> = { payment: "Paiement", payout: "Retrait" };
export const METHOD_LABELS: Record<string, string> = { mobile_money: "Mobile money", card: "Carte" };
export const ROLE_LABELS: Record<string, string> = {
  collection: "Encaissement du payeur",
  disbursement: "Versement au bénéficiaire",
  reversal: "Remboursement du payeur",
};
export const DELIVERY_LABELS: Record<string, string> = {
  pending: "En cours",
  delivered: "Livrée",
  failed: "Abandonnée",
};

export function StatusBadge({ status }: { status: string }) {
  const known = STATUS[status as keyof typeof STATUS];
  return <Badge tone={known?.tone ?? "gray"}>{known?.label ?? status}</Badge>;
}

export const STATUS_OPTIONS = Object.entries(STATUS).map(([value, { label }]) => ({ value, label }));
