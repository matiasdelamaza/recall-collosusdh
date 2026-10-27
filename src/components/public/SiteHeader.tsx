import { COMMON, HEADER } from "@/lib/copy/es";

const NAV = [
  { href: "#verificar", label: HEADER.nav.verify },
  { href: "#que-hacer", label: HEADER.nav.whatToDo },
  { href: "#preguntas-frecuentes", label: HEADER.nav.faq },
  { href: "#contacto", label: HEADER.nav.contact },
] as const;

/**
 * Cabecera mínima: sin navegación ecommerce.
 * Los wordmarks de /public/brand son marcadores tipográficos; reemplazar por los logotipos oficiales.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        {COMMON.skipToContent}
      </a>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <a href="#verificar" className="flex shrink-0 items-center" aria-label="Polygon — ir al verificador">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/polygon-wordmark.svg" alt="Polygon" width={112} height={21} className="h-[18px] w-auto sm:h-[21px]" />
        </a>
        <p className="hidden text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 md:block">{HEADER.eyebrow}</p>
        <div className="flex shrink-0 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/crossmountain-wordmark.svg" alt="Cross Mountain" width={150} height={20} className="h-[14px] w-auto sm:h-[17px]" />
        </div>
      </div>
      <nav aria-label="Secciones del sitio" className="border-t border-line">
        <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => (
            <li key={item.href} className="shrink-0">
              <a
                href={item.href}
                className="block whitespace-nowrap px-2.5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-700 hover:text-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
