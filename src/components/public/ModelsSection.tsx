import { MODELS } from "@/lib/copy/es";
import { Container, SectionTitle } from "./ui";

export interface ModelsSectionProps {
  /** Imágenes disponibles en /public/modelos (clave de modelo → existe). Calculado en el servidor. */
  availableImages: Record<string, boolean>;
}

/**
 * Modelos incluidos en la campaña. Las fotografías oficiales se muestran solo si existen en
 * `public/modelos/collosus-dh7.webp` y `public/modelos/collosus-dh9.webp`; si no, se muestra un
 * marcador neutro (nunca una imagen rota).
 */
export function ModelsSection({ availableImages }: ModelsSectionProps) {
  return (
    <section id="modelos" aria-labelledby="modelos-titulo" className="border-t border-line bg-paper py-14 sm:py-20">
      <Container wide>
        <SectionTitle id="modelos-titulo">{MODELS.title}</SectionTitle>
        <p className="max-w-2xl text-[16px] leading-relaxed text-ink-700 sm:text-[17px]">{MODELS.intro}</p>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2">
          {MODELS.items.map((m) => (
            <li key={m.key} className="overflow-hidden rounded-md bg-paper-100">
              <div className="flex aspect-[12/7] items-center justify-center">
                {availableImages[m.key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt={m.alt} width={720} height={420} loading="lazy" className="h-full w-full object-contain px-4 pt-4" />
                ) : (
                  <div className="px-6 text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-ink-300">{MODELS.photoPending}</p>
                  </div>
                )}
              </div>
              <div className="px-5 pb-5 pt-2">
                <h3 translate="no" className="headline text-[26px] text-ink">Polygon {m.name}</h3>
                <p className="mt-1 text-sm text-ink-500">{m.description}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[15px] font-semibold text-ink">{MODELS.note}</p>
      </Container>
    </section>
  );
}
