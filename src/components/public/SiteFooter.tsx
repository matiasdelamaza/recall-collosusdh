import { BRAND, FOOTER } from "@/lib/copy/es";

export function SiteFooter({ lastUpdated }: { lastUpdated: string }) {
  return (
    <footer className="border-t border-line bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/polygon-logo-white.png" alt="Polygon" width={419} height={96} className="h-7 w-auto" loading="lazy" />
          <span aria-hidden="true" className="text-ink-300">×</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/crossmountain-wordmark.svg" alt="Cross Mountain" width={150} height={20} className="h-[14px] w-auto invert" loading="lazy" />
        </div>
        <p className="mt-6 text-[12px] font-bold uppercase tracking-[0.18em]">{FOOTER.line1}</p>
        <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-300">{FOOTER.line2}</p>
        <p className="mt-4 text-sm text-paper">{BRAND.domain}</p>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-300">{FOOTER.legal}</p>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <li>
            <a href="/privacidad" className="underline underline-offset-4 hover:text-ink-300">
              {FOOTER.links.privacy}
            </a>
          </li>
          <li>
            <a href="#preguntas-frecuentes" className="underline underline-offset-4 hover:text-ink-300">
              {FOOTER.links.recallInfo}
            </a>
          </li>
          <li>
            <a href="#contacto" className="underline underline-offset-4 hover:text-ink-300">
              {FOOTER.links.contact}
            </a>
          </li>
          <li>
            <a href="https://www.crossmountain.cl" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink-300">
              {FOOTER.links.crossMountain}
            </a>
          </li>
          <li>
            <a href="https://www.polygonbikes.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink-300">
              {FOOTER.links.polygon}
            </a>
          </li>
        </ul>
        <p className="mt-8 text-xs text-ink-300">
          {FOOTER.lastUpdated}: {lastUpdated}
        </p>
      </div>
    </footer>
  );
}
