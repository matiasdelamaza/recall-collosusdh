"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Botón de envío que se deshabilita y cambia de texto mientras corre la server action del formulario. */
export function PendingButton({ children, pendingLabel, className }: { children: ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
