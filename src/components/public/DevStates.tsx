"use client";

import { useState } from "react";
import { FLOW } from "@/lib/copy/es";
import type { RequestType } from "@/lib/types";
import { RegistrationForm } from "./RegistrationForm";
import { SuccessState } from "./SuccessState";
import { Container } from "./ui";
import { VerificationResult, type VerifyOk } from "./VerificationResult";

/**
 * Galería de estados para QA visual SIN backend. Solo en desarrollo.
 * Las series son de ejemplo y claramente ficticias.
 */
const RESULTS: { label: string; result: VerifyOk }[] = [
  { label: "A — Afectada", result: { ok: true, state: "AFFECTED", serial: "EJEMPLO-AFECTADA-0001", model: "Collosus DH7", size: "M" } },
  { label: "B — No identificada", result: { ok: true, state: "NOT_IDENTIFIED", serial: "EJEMPLO-NO-ID-0002" } },
  { label: "C — No verificable", result: { ok: true, state: "UNVERIFIED", serial: "EJEMPLO-X", reason: "TOO_SHORT" } },
  { label: "Interino — Pendiente de base", result: { ok: true, state: "PENDING_DATABASE", serial: "EJEMPLO-PENDIENTE-0003" } },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <Container>
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.16em] text-ink-500">{title}</p>
        {children}
      </Container>
    </section>
  );
}

export function DevStates() {
  const [formType, setFormType] = useState<RequestType>("REPLACEMENT");
  const noop = () => {};
  return (
    <main id="contenido" className="pb-20">
      <Container>
        <h1 className="headline py-8 text-[28px] text-ink">{FLOW.devPageTitle}</h1>
      </Container>

      {RESULTS.map((r) => (
        <Block key={r.label} title={`Resultado · ${r.label}`}>
          <VerificationResult result={r.result} onStartRegistration={noop} onVerifyAnother={noop} />
        </Block>
      ))}

      <Block title="Formulario de registro">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["REPLACEMENT", "MANUAL_REVIEW", "PENDING_DATABASE"] as RequestType[]).map((t) => (
            <button key={t} type="button" onClick={() => setFormType(t)} className={`rounded-sm border px-3 py-1.5 font-mono text-xs ${formType === t ? "border-ink bg-ink text-paper" : "border-line text-ink-700"}`}>
              {t}
            </button>
          ))}
        </div>
        <RegistrationForm
          key={formType}
          serial="EJEMPLO-AFECTADA-0001"
          requestType={formType}
          verification={formType === "REPLACEMENT" ? "AFFECTED" : formType === "PENDING_DATABASE" ? "PENDING_DATABASE" : "UNVERIFIED"}
          onSuccess={noop}
          onBack={noop}
        />
      </Block>

      <Block title="Confirmación · caso creado">
        <SuccessState outcome="CREATED" caseId="RCDH-EJMPL" serial="EJEMPLO-AFECTADA-0001" requestType="REPLACEMENT" onBackHome={noop} />
      </Block>
      <Block title="Confirmación · caso existente">
        <SuccessState outcome="EXISTING" caseId="RCDH-EJMPL" serial="EJEMPLO-AFECTADA-0001" requestType="REPLACEMENT" onBackHome={noop} />
      </Block>
      <Block title="Confirmación · revisión manual">
        <SuccessState outcome="CREATED" caseId="RCDH-EJMPL" serial="EJEMPLO-X" requestType="MANUAL_REVIEW" onBackHome={noop} />
      </Block>
    </main>
  );
}
