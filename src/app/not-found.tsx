import { SiteHeader } from "@/components/public/SiteHeader";
import { Container } from "@/components/public/ui";
import { COMMON } from "@/lib/copy/es";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="contenido" className="py-16 sm:py-24">
        <Container>
          <h1 className="headline text-[30px] text-ink sm:text-[40px]">{COMMON.notFoundTitle}</h1>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{COMMON.notFoundBody}</p>
          <p className="mt-8">
            <a href="/" className="inline-flex min-h-12 items-center rounded-sm bg-ink px-5 text-[15px] font-bold text-paper">
              {COMMON.backHome}
            </a>
          </p>
        </Container>
      </main>
    </>
  );
}
