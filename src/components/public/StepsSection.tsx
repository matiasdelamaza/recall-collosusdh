import { FLOW, STEPS } from "@/lib/copy/es";
import { Container, SectionTitle } from "./ui";

export function StepsSection() {
  return (
    <section id="que-hacer" aria-labelledby="que-hacer-titulo" className="border-t border-line bg-paper-100 py-14 sm:py-20">
      <Container wide>
        <SectionTitle id="que-hacer-titulo">{STEPS.title}</SectionTitle>
        {/* Paso 02 (dejar de usar la bicicleta) se destaca: es la instrucción de seguridad. */}
        <ol aria-label={FLOW.stepsRegionLabel} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.items.map((s, i) => {
            const critical = i === 1;
            return (
              <li
                key={s.n}
                className={`rounded-md border-t-4 p-5 ${critical ? "border-alert bg-alert-50" : "border-ink bg-paper"} ${
                  i === STEPS.items.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""
                }`}
              >
                <span className={`headline text-[34px] ${critical ? "text-alert" : "text-ink-300"}`}>{s.n}</span>
                <h3 className={`mt-2 text-[17px] font-bold leading-snug ${critical ? "text-alert-700" : "text-ink"}`}>{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-700">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
