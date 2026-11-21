import { Badge } from "@/components/ui";

const STATUS = {
  pending: { label: "En attente du payeur", tone: "amber" },
  processing: { label: "Versement en cours", tone: "blue" },
  succeeded: { label: "Effectué", tone: "green" },
  failed: { label: "Échoué", tone: "gray" },
  reversing: { label: "Remboursement en cours", tone: "amber" },
  reversed: { label: "Remboursé", tone: "gray" },
  requires_review: { label: "En revue", tone: "red" },
} as const;

export const FEES_LABELS: Record<string, string> = {
  payer: "Payés par le payeur",
  beneficiary: "Payés par le bénéficiaire",
  service: "Pris en charge par le service",
};

export function TransferStatusBadge({ status }: { status: string }) {
  const known = STATUS[status as keyof typeof STATUS];
  return <Badge tone={known?.tone ?? "gray"}>{known?.label ?? status}</Badge>;
}

export const TRANSFER_STATUS_OPTIONS = Object.entries(STATUS).map(([value, { label }]) => ({ value, label }));
