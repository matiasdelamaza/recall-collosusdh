import type { ReactNode } from "react";
import type { CaseStatus, Priority, SerialVerificationStatus } from "@/db/schema";
import { labelPriority, labelStatus, labelVerification } from "./format";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="headline text-2xl text-ink sm:text-3xl">{title}</h1>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-line bg-paper p-4 sm:p-5 ${className}`}>
      {title ? <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">{title}</h2> : null}
      {children}
    </section>
  );
}

export function KpiTile({ label, value, hint, alert = false }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${alert ? "border-alert bg-alert-50" : "border-line bg-paper"}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tabular-nums ${alert ? "text-alert-700" : "text-ink"}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function FieldRow({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-line py-2 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className={`break-words text-sm text-ink ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

const tone = {
  neutral: "border-line bg-paper-100 text-ink-700",
  dark: "border-ink bg-ink text-paper",
  alert: "border-alert bg-alert-50 text-alert-700",
  caution: "border-caution bg-caution-50 text-caution",
  ok: "border-ink-300 bg-paper text-ink",
} as const;

export function Badge({ children, variant = "neutral" }: { children: ReactNode; variant?: keyof typeof tone }) {
  return <span className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone[variant]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const variant: keyof typeof tone =
    status === "REPLACED" || status === "CLOSED"
      ? "dark"
      : status === "MANUAL_REVIEW" || status === "DUPLICATE_CASE" || status === "INVALID_SERIAL" || status === "CUSTOMER_UNREACHABLE"
        ? "caution"
        : "neutral";
  return <Badge variant={variant}>{labelStatus(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge variant={priority === "HIGH" ? "alert" : "neutral"}>{labelPriority(priority)}</Badge>;
}

export function VerificationBadge({ status }: { status: SerialVerificationStatus }) {
  const variant: keyof typeof tone = status === "AFFECTED" ? "alert" : status === "NOT_IDENTIFIED" ? "ok" : "caution";
  return <Badge variant={variant}>{labelVerification(status)}</Badge>;
}

export function Flash({ kind = "ok", children }: { kind?: "ok" | "error"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${kind === "error" ? "border-alert bg-alert-50 text-alert-700" : "border-ink bg-paper-100 text-ink"}`}
    >
      {children}
    </div>
  );
}

export function AlertBox({ children, tone: t = "alert" }: { children: ReactNode; tone?: "alert" | "caution" }) {
  return (
    <div role="alert" className={`rounded-md border-2 px-3 py-2 text-sm font-semibold ${t === "alert" ? "border-alert bg-alert-50 text-alert-700" : "border-caution bg-caution-50 text-caution"}`}>
      {children}
    </div>
  );
}

export const inputClass = "w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-300 focus:border-ink";
export const selectClass = "w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-ink";
export const buttonPrimary = "inline-flex min-h-10 items-center justify-center rounded-sm bg-ink px-4 text-sm font-bold uppercase tracking-wide text-paper hover:bg-ink-700 disabled:opacity-50";
export const buttonSecondary = "inline-flex min-h-10 items-center justify-center rounded-sm border border-ink bg-paper px-4 text-sm font-bold uppercase tracking-wide text-ink hover:bg-paper-100 disabled:opacity-50";
export const buttonDanger = "inline-flex min-h-10 items-center justify-center rounded-sm bg-alert px-4 text-sm font-bold uppercase tracking-wide text-paper hover:bg-alert-700 disabled:opacity-50";
export const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500";
