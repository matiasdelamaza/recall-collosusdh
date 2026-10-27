import { SAFETY } from "@/lib/copy/es";
import { Container } from "./ui";

export function SafetySection() {
  return (
    <section id="seguridad" aria-labelledby="seguridad-titulo" className="scroll-mt-6 bg-ink py-14 text-paper sm:py-20">
      <Container>
        <h2 id="seguridad-titulo" className="headline mb-6 text-[26px] sm:text-[32px]">
          {SAFETY.title}
        </h2>
        <div className="space-y-4 text-[16px] leading-relaxed text-paper-200 sm:text-[17px]">
          <p>{SAFETY.p1}</p>
          <p>{SAFETY.p2}</p>
          <p className="font-semibold text-paper">{SAFETY.p3}</p>
          <p className="font-semibold text-paper">{SAFETY.p4}</p>
        </div>
      </Container>
    </section>
  );
}
