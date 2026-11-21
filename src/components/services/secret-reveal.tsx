"use client";

import { useState } from "react";

import { Button, inputClass } from "@/components/ui";

/** Secret affiché une seule fois : jamais stocké, à copier immédiatement. */
export function SecretReveal({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          aria-label={label}
          onFocus={(event) => event.currentTarget.select()}
          className={`${inputClass} font-mono`}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? "Copié" : "Copier"}
        </Button>
      </div>
    </div>
  );
}
