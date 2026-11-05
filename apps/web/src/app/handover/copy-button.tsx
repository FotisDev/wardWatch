"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
      >
        {copied ? "Copied" : "Copy as text"}
      </button>
      <button
        onClick={() => window.print()}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
      >
        Print
      </button>
    </>
  );
}
