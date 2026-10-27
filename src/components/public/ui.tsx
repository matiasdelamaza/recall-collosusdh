"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "alert" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-700 border border-ink",
  secondary: "bg-paper text-ink border border-ink hover:bg-paper-100",
  alert: "bg-alert text-white hover:bg-alert-700 border border-alert",
  ghost: "bg-transparent text-ink underline underline-offset-4 hover:text-ink-700 border border-transparent",
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-12 w-full items-center justify-center rounded-sm px-5 text-[15px] font-bold tracking-wide transition-[color,background-color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 sm:w-auto",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "alert" | "caution"; children: ReactNode }) {
  const tones = {
    neutral: "bg-paper-200 text-ink-700",
    alert: "bg-alert text-white",
    caution: "bg-caution-50 text-caution",
  } as const;
  return (
    <span className={cx("inline-block rounded-sm px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em]", tones[tone])}>
      {children}
    </span>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-alert" role="alert">
      {message}
    </p>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  optionalLabel,
  requiredLabel,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optionalLabel?: string;
  requiredLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required ? (
          <span className="ml-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">{requiredLabel ?? ""}</span>
        ) : (
          <span className="ml-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">{optionalLabel ?? ""}</span>
        )}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mb-1.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export const inputClass =
  "block w-full min-h-12 rounded-sm border border-line bg-paper px-3.5 text-[16px] text-ink placeholder:text-ink-300 focus:border-ink focus:outline-none aria-[invalid=true]:border-alert";

export const selectClass = cx(inputClass, "appearance-none bg-no-repeat pr-10");

export const SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%230b0b0c' stroke-width='2'><path d='M4 6l4 4 4-4'/></svg>\")",
  backgroundPosition: "right 12px center",
} as const;

export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="headline mb-6 text-[32px] text-ink sm:text-[44px]">
      {children}
    </h2>
  );
}

export function Container({ className, children, wide }: { className?: string; children: ReactNode; wide?: boolean }) {
  return <div className={cx("mx-auto w-full px-5 sm:px-8", wide ? "max-w-5xl" : "max-w-3xl", className)}>{children}</div>;
}
