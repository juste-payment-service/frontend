import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Console Payment Service", template: "%s · Console Payment Service" },
  description: "Administration du service de paiement mutualisé.",
  robots: { index: false, follow: false }, // console privée : jamais indexée
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
