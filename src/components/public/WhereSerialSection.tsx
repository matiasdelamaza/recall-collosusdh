import { WHERE_SERIAL } from "@/lib/copy/es";
import { Container, SectionTitle } from "./ui";

/** Posición de cada marcador sobre la foto de la DH7 (720×420), en porcentaje. */
const MARKER_POSITIONS = [
  { left: "41.7%", top: "70%", primary: true }, // bajo la caja del pedalier
  { left: "65%", top: "28%", primary: false }, // pipa de dirección
] as const;

export function WhereSerialSection() {
  return (
    <section id="donde-esta-la-serie" aria-labelledby="serie-titulo" className="border-t border-line bg-paper-100 py-14 sm:py-20">
      <Container wide>
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-12">
          <div>
            <SectionTitle id="serie-titulo">{WHERE_SERIAL.title}</SectionTitle>
            <div className="space-y-4 text-[16px] leading-relaxed text-ink-700">
              <p>{WHERE_SERIAL.body1}</p>
              <p>{WHERE_SERIAL.body2}</p>
              <p>{WHERE_SERIAL.body3}</p>
            </div>
          </div>
          <figure className="rounded-md bg-paper p-4 sm:p-6">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/modelos/collosus-dh7.webp" alt={WHERE_SERIAL.figureAlt} width={720} height={420} loading="lazy" className="h-auto w-full" />
              {MARKER_POSITIONS.map((m, i) => (
                <span
                  key={WHERE_SERIAL.markers[i]!.n}
                  aria-hidden="true"
                  style={{ left: m.left, top: m.top }}
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-bold ${
                    m.primary
                      ? "h-10 w-10 border-[3px] border-alert bg-alert/10 sm:h-16 sm:w-16"
                      : "h-8 w-8 border-2 border-dashed border-ink bg-paper/30 sm:h-12 sm:w-12"
                  }`}
                >
                  <span
                    className={`absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full text-[12px] text-paper ${m.primary ? "bg-alert" : "bg-ink"}`}
                  >
                    {WHERE_SERIAL.markers[i]!.n}
                  </span>
                </span>
              ))}
            </div>
            <figcaption className="mt-4 space-y-2 text-sm text-ink-700">
              <ol className="space-y-2">
                {WHERE_SERIAL.markers.map((m, i) => (
                  <li key={m.n} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-paper ${i === 0 ? "bg-alert" : "bg-ink"}`}
                    >
                      {m.n}
                    </span>
                    <span className={i === 0 ? "font-semibold text-ink" : undefined}>{m.label}</span>
                  </li>
                ))}
              </ol>
            </figcaption>
          </figure>
        </div>
      </Container>
    </section>
  );
}
