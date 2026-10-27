import { FAQ } from "@/lib/copy/es";
import { Container, SectionTitle } from "./ui";

export function FaqSection() {
  return (
    <section id="preguntas-frecuentes" aria-labelledby="faq-titulo" className="scroll-mt-6 border-t border-line bg-paper py-14 sm:py-20">
      <Container>
        <SectionTitle id="faq-titulo">{FAQ.title}</SectionTitle>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.items.map((item, i) => (
            <details key={i} className="group">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-[16px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-xl leading-none text-ink-500 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="space-y-3 pb-5 text-[15px] leading-relaxed text-ink-700">
                {item.a.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
