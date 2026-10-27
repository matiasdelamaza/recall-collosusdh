import { WHERE_SERIAL } from "@/lib/copy/es";
import { Container, SectionTitle } from "./ui";

export function WhereSerialSection() {
  return (
    <section id="donde-esta-la-serie" aria-labelledby="serie-titulo" className="border-t border-line bg-paper-100 py-14 sm:py-20">
      <Container wide>
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-12">
          <div>
            <SectionTitle id="serie-titulo">{WHERE_SERIAL.title}</SectionTitle>
            <div className="space-y-4 text-[16px] leading-relaxed text-ink-700">
              <p>{WHERE_SERIAL.body1}</p>
              <div className="rounded-md border-l-4 border-ink bg-paper p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{WHERE_SERIAL.exampleLabel}</p>
                <p className="serial mt-1 text-[28px] font-bold leading-none tracking-[0.06em] text-ink" translate="no">
                  {WHERE_SERIAL.exampleSerial}
                </p>
                <p className="mt-2 text-sm text-ink-500">{WHERE_SERIAL.exampleNote}</p>
              </div>
              <p>{WHERE_SERIAL.body2}</p>
              <p>{WHERE_SERIAL.body3}</p>
            </div>
          </div>
          <figure className="rounded-md bg-paper p-4 sm:p-6">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/modelos/collosus-dh7.webp" alt={WHERE_SERIAL.figureAlt} width={720} height={420} loading="lazy" className="h-auto w-full" />
              {/* Marcador sobre la caja del pedalier (posición en % de la foto de 720×420). */}
              <span
                aria-hidden="true"
                style={{ left: "41.7%", top: "70%" }}
                className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-alert bg-alert/10 sm:h-16 sm:w-16"
              />
            </div>
            <figcaption className="mt-4 flex items-center gap-2.5 text-sm font-semibold text-ink">
              <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-[3px] border-alert" />
              {WHERE_SERIAL.markerLabel}
            </figcaption>
          </figure>
        </div>
      </Container>
    </section>
  );
}
