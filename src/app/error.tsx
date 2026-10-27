"use client";

import { useEffect } from "react";
import { COMMON } from "@/lib/copy/es";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="contenido" className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <h1 className="headline text-[30px] text-ink sm:text-[40px]">{COMMON.errorTitle}</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{COMMON.errorBody}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={() => reset()} className="inline-flex min-h-12 items-center justify-center rounded-sm bg-ink px-5 text-[15px] font-bold text-paper">
          {COMMON.retry}
        </button>
        <a href="/" className="inline-flex min-h-12 items-center justify-center rounded-sm border border-ink px-5 text-[15px] font-bold text-ink">
          {COMMON.backHome}
        </a>
      </div>
    </main>
  );
}
