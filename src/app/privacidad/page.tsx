import type { Metadata } from "next";
import { SiteHeader } from "@/components/public/SiteHeader";
import { Container } from "@/components/public/ui";
import { COMMON, PRIVACY } from "@/lib/copy/es";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  alternates: { canonical: "/privacidad" },
};

export default function PrivacidadPage() {
  return (
    <>
      <SiteHeader />
      <main id="contenido" className="py-12 sm:py-16">
        <Container>
          <h1 className="headline text-[30px] text-ink sm:text-[40px]">{PRIVACY.title}</h1>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">{PRIVACY.intro}</p>
          <div className="mt-8 space-y-7">
            {PRIVACY.sections.map((s) => (
              <section key={s.h}>
                <h2 className="text-[18px] font-bold text-ink">{s.h}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{s.p}</p>
              </section>
            ))}
          </div>
          <p className="mt-10 rounded-sm border border-line bg-paper-100 px-4 py-3 text-sm text-ink-500">{PRIVACY.reviewNotice}</p>
          <p className="mt-8">
            <a href="/" className="text-[15px] font-semibold underline underline-offset-4">
              {COMMON.backHome}
            </a>
          </p>
        </Container>
      </main>
    </>
  );
}
