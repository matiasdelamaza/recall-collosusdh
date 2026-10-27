import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevStates } from "@/components/public/DevStates";
import { SiteHeader } from "@/components/public/SiteHeader";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Página SOLO de desarrollo para QA visual de todos los estados. En producción no existe. */
export default function DevEstadosPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <SiteHeader />
      <DevStates />
    </>
  );
}
