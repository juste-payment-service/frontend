"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Les écrans pas encore livrés restent visibles mais désactivés, pour annoncer la suite. */
const LINKS: { href: string; label: string; ready: boolean }[] = [
  { href: "/services", label: "Services", ready: true },
  { href: "/transactions", label: "Transactions", ready: false },
  { href: "/dashboard", label: "Tableau de bord", ready: false },
  { href: "/users", label: "Utilisateurs", ready: false },
  { href: "/transfers", label: "Transferts", ready: false },
  { href: "/reviews", label: "À régulariser", ready: false },
  { href: "/api-explorer", label: "Explorateur d'API", ready: false },
];

export function ConsoleNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="-mx-1 flex gap-1 overflow-x-auto">
      {LINKS.map(({ href, label, ready }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        if (!ready) {
          return (
            <span key={href} title="Bientôt disponible" className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-slate-400 dark:text-slate-600">
              {label}
            </span>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
