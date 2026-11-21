import NextAuth from "next-auth";

import { getAuthOptions } from "@/lib/server/auth";

// Options construites à chaque requête : les secrets viennent de Doppler (cache 5 min).
async function handler(request: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  return NextAuth(request as never, context as never, await getAuthOptions());
}

export { handler as GET, handler as POST };
