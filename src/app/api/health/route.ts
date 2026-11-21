import { NextResponse } from "next/server";

/**
 * Sonde publique : la CI de déploiement attend la révision du commit construit pour confirmer que
 * la nouvelle version est en ligne. Ne lit aucun secret et ne révèle rien d'autre.
 */
export function GET() {
  const raw = process.env.CONSOLE_REVISION ?? "";
  const revision = /^[0-9a-f]{40}$/.test(raw) ? raw.slice(0, 12) : null;
  return NextResponse.json(
    { status: "ok", revision },
    { headers: { "Cache-Control": "no-store" } },
  );
}
