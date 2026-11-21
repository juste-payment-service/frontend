"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signIn("google", { callbackUrl });
      }}
      className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
    >
      {pending ? "Redirection vers Google…" : "Se connecter avec Google"}
    </button>
  );
}
