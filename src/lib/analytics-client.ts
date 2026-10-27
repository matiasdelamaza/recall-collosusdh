/**
 * Analítica del lado del cliente. SOLO envía el nombre del evento.
 * Nunca envía RUT, serie, correo, teléfono ni descripciones. Nunca lanza.
 */
import type { AnalyticsEvent } from "@/lib/types";

let pageViewSent = false;

export function track(name: AnalyticsEvent): void {
  try {
    if (typeof window === "undefined") return;
    void fetch("/api/analytics", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
  } catch {
    // silencioso
  }
}

/** Registra una vista de página una sola vez por carga. */
export function trackPageView(): void {
  if (pageViewSent) return;
  pageViewSent = true;
  track("page_view");
}
