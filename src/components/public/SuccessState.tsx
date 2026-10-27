"use client";

import type { RefObject } from "react";
import { SUCCESS } from "@/lib/copy/es";
import type { RequestType } from "@/lib/types";
import { Button } from "./ui";

export interface SuccessStateProps {
  outcome: "CREATED" | "EXISTING";
  caseId: string;
  serial: string;
  requestType: RequestType;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onBackHome: () => void;
}

function bodyFor(requestType: RequestType): string {
  if (requestType === "MANUAL_REVIEW") return SUCCESS.bodyManualReview;
  if (requestType === "PENDING_DATABASE") return SUCCESS.bodyPendingDatabase;
  return SUCCESS.body;
}

/** Estado tras el registro (brief §14), incluida la variante de caso ya existente (brief §17). */
export function SuccessState({ outcome, caseId, serial, requestType, headingRef, onBackHome }: SuccessStateProps) {
  const existing = outcome === "EXISTING";
  return (
    <article aria-labelledby="exito-titulo" className="rounded-md border-2 border-ink bg-paper">
      <div className="border-b border-line px-5 py-6 sm:px-8 sm:py-8">
        <h2 id="exito-titulo" ref={headingRef} tabIndex={-1} className="headline text-[26px] text-ink outline-none sm:text-[34px]">
          {existing ? SUCCESS.existingTitle : SUCCESS.title}
        </h2>
        <p className="headline mt-3 text-[22px] text-alert sm:text-[28px]">{SUCCESS.subtitle}</p>
      </div>
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <p className="text-[16px] leading-relaxed text-ink-700">{existing ? SUCCESS.existingBody : bodyFor(requestType)}</p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-sm bg-paper-100 p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{SUCCESS.caseIdLabel}</dt>
            <dd className="mt-1 font-mono text-[28px] font-bold tracking-wide text-ink sm:text-[32px]">{caseId}</dd>
          </div>
          <div className="rounded-sm bg-paper-100 p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{SUCCESS.serialLabel}</dt>
            <dd className="mt-1 break-all font-mono text-[18px] font-bold text-ink">{serial}</dd>
          </div>
        </dl>

        {!existing ? <p className="mt-5 text-sm text-ink-500">{SUCCESS.emailNotice}</p> : null}

        <div className="mt-6">
          <Button variant="secondary" onClick={onBackHome}>
            {SUCCESS.backHome}
          </Button>
        </div>
      </div>
    </article>
  );
}
