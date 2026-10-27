import { WHERE_SERIAL } from "@/lib/copy/es";
import { Container, SectionTitle } from "./ui";

export function WhereSerialSection() {
  return (
    <section id="donde-esta-la-serie" aria-labelledby="serie-titulo" className="scroll-mt-6 border-t border-line bg-paper-100 py-14 sm:py-20">
      <Container wide>
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div>
            <SectionTitle id="serie-titulo">{WHERE_SERIAL.title}</SectionTitle>
            <div className="space-y-4 text-[16px] leading-relaxed text-ink-700">
              <p>{WHERE_SERIAL.body1}</p>
              <p>{WHERE_SERIAL.body2}</p>
              <p>{WHERE_SERIAL.body3}</p>
            </div>
          </div>
          <figure className="rounded-md border border-line bg-paper p-4 sm:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/serial-location.svg" alt="" width={640} height={380} className="h-auto w-full" />
            <figcaption className="mt-3 text-sm text-ink-500">{WHERE_SERIAL.figureCaption}</figcaption>
          </figure>
        </div>
      </Container>
    </section>
  );
}
