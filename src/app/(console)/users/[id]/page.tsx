import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Alert, ButtonLink, Card, Dl, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { ApiError } from "@/lib/server/api-client";
import { type UserSummary, users } from "@/lib/server/users";

export const metadata: Metadata = { title: "Utilisateur" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let user: UserSummary;
  try {
    user = await users.get(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    return <Alert>{toActionError(error).message}</Alert>;
  }

  return (
    <div className="space-y-6">
      <Link href="/users" className="text-sm text-slate-500 hover:underline">← Utilisateurs</Link>
      <PageHeader
        title="Utilisateur"
        description={user.user_id}
        actions={
          <div className="flex gap-2">
            <ButtonLink variant="secondary" href={`/transactions?user_id=${user.user_id}`}>Ses transactions</ButtonLink>
            <ButtonLink variant="secondary" href={`/transfers?user_id=${user.user_id}`}>Ses transferts</ButtonLink>
          </div>
        }
      />
      <Card>
        <Dl items={[["Première activité", formatDateTime(user.first_seen_at)], ["Dernière activité", formatDateTime(user.last_seen_at)]]} />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {user.services.map((service) => (
          <Card
            key={service.service_id}
            title={service.service_name}
            actions={<Link href={`/transactions?user_id=${user.user_id}&service_id=${service.service_id}`} className="text-sm underline">Transactions</Link>}
          >
            <p className="mb-3 text-sm text-slate-500">{formatNumber(service.transactions_count)} transaction(s)</p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-1 font-medium">Devise</th>
                  <th className="py-1 text-right font-medium">Payé</th>
                  <th className="py-1 text-right font-medium">Reçu</th>
                </tr>
              </thead>
              <tbody>
                {service.totals.map((t) => (
                  <tr key={t.currency} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1">{t.currency}</td>
                    <td className="py-1 text-right tabular-nums">{formatAmount(t.paid_amount, t.currency)}</td>
                    <td className="py-1 text-right tabular-nums">{formatAmount(t.received_amount, t.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </div>
  );
}
