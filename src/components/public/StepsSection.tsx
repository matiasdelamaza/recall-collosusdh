import { FLOW, STEPS } from "@/lib/copy/es";
import { Container, SectionTitle } from "./ui";

export function StepsSection() {
  return (
    <section id="que-hacer" aria-labelledby="que-hacer-titulo" className="scroll-mt-6 border-t border-line bg-paper py-14 sm:py-20">
      <Container wide>
        <SectionTitle id="que-hacer-titulo">{STEPS.title}</SectionTitle>
        <ol aria-label={FLOW.stepsRegionLabel} className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.items.map((s) => (
            <li key={s.n} className="bg-paper p-5">
              <span className="font-mono text-[12px] font-bold tracking-[0.2em] text-ink-500">{s.n}</span>
              <h3 className="mt-2 text-[17px] font-bold leading-snug text-ink">{s.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-700">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
