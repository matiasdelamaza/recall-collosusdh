import { COMMON, HEADER } from "@/lib/copy/es";

const NAV = [
  { href: "#verificar", label: HEADER.nav.verify },
  { href: "#que-hacer", label: HEADER.nav.whatToDo },
  { href: "#preguntas-frecuentes", label: HEADER.nav.faq },
  { href: "#contacto", label: HEADER.nav.contact },
] as const;

/**
 * Cabecera fija y mínima: sin navegación ecommerce.
 * En móvil, logos arriba y navegación desplazable abajo; desde md, todo en una fila.
 * El wordmark de Cross Mountain sigue siendo un marcador tipográfico (falta el logotipo oficial).
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        {COMMON.skipToContent}
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 px-5 sm:px-8 md:flex-nowrap">
        <a href="#verificar" className="flex shrink-0 items-center py-3" aria-label="Polygon — ir al verificador">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/polygon-logo.png" alt="Polygon" width={419} height={96} className="h-7 w-auto sm:h-8" />
        </a>
        <div className="flex shrink-0 items-center py-3 md:order-last">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/crossmountain-wordmark.svg" alt="Cross Mountain" width={150} height={20} className="h-[13px] w-auto sm:h-[15px]" />
        </div>
        <nav aria-label="Secciones del sitio" className="-mx-5 w-[calc(100%+2.5rem)] border-t border-line sm:-mx-8 sm:w-[calc(100%+4rem)] md:mx-0 md:w-auto md:flex-1 md:border-t-0">
          <ul className="flex gap-1 overflow-x-auto px-3 sm:px-6 md:justify-center md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => (
              <li key={item.href} className="shrink-0">
                <a
                  href={item.href}
                  className="block whitespace-nowrap rounded-sm px-2.5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-700 transition-colors hover:bg-paper-100 hover:text-ink md:py-2"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
