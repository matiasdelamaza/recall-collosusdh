import { SAFETY } from "@/lib/copy/es";
import { Container } from "./ui";

export function SafetySection() {
  return (
    <section id="seguridad" aria-labelledby="seguridad-titulo" className="bg-ink py-14 text-paper sm:py-20">
      <Container>
        <h2 id="seguridad-titulo" className="headline mb-6 flex items-center gap-3 text-[30px] sm:text-[40px]">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 shrink-0 text-alert sm:h-10 sm:w-10" fill="currentColor">
            <path d="M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z" />
          </svg>
          {SAFETY.title}
        </h2>
        <div className="space-y-4 border-l-4 border-alert pl-5 text-[16px] leading-relaxed text-paper-200 sm:text-[17px]">
          <p>{SAFETY.p1}</p>
          <p>{SAFETY.p2}</p>
          <p className="font-semibold text-paper">{SAFETY.p3}</p>
          <p className="font-semibold text-paper">{SAFETY.p4}</p>
        </div>
      </Container>
    </section>
  );
}
