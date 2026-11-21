import type { Metadata } from "next";
import Link from "next/link";

import { ServiceForm } from "@/components/services/service-form";
import { PageHeader } from "@/components/ui";

import { createServiceAction } from "../actions";

export const metadata: Metadata = { title: "Nouveau service" };

export default function NewServicePage() {
  return (
    <div className="space-y-6">
      <Link href="/services" className="text-sm text-slate-500 hover:underline">← Services</Link>
      <PageHeader
        title="Nouveau service"
        description="L'identifiant, la clé API et le secret des webhooks sont générés automatiquement et affichés une seule fois."
      />
      <ServiceForm action={createServiceAction} submitLabel="Créer le service" />
    </div>
  );
}
