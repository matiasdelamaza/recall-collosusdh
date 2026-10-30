import Script from "next/script";

const WIDGET_SRC = "https://www.trymaba.com/widget.js";

/**
 * Agente de MABA (chat) del sitio público.
 *
 * Se activa con NEXT_PUBLIC_MABA_MERCHANT_ID (se pasa como data-merchant al script de MABA).
 * Sin configurar, en producción no se muestra nada; en desarrollo aparece un marcador para
 * ubicar el widget.
 */
export function MabaWidget() {
  const merchantId = process.env.NEXT_PUBLIC_MABA_MERCHANT_ID?.trim();

  if (merchantId) {
    return <Script id="maba-widget" src={WIDGET_SRC} strategy="lazyOnload" data-merchant={merchantId} />;
  }

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div
      id="maba-widget-placeholder"
      aria-hidden="true"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-dashed border-ink-300 bg-paper px-4 py-3 text-sm text-ink-500 shadow-lg"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-caution" />
      Agente MABA (sin configurar)
    </div>
  );
}
