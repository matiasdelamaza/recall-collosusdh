import fs from "node:fs";
import path from "node:path";
import { ContactSection } from "@/components/public/ContactSection";
import { FaqSection } from "@/components/public/FaqSection";
import { ModelsSection } from "@/components/public/ModelsSection";
import { PageViewTracker } from "@/components/public/PageViewTracker";
import { RecallFlow } from "@/components/public/RecallFlow";
import { SafetySection } from "@/components/public/SafetySection";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SiteHeader } from "@/components/public/SiteHeader";
import { StepsSection } from "@/components/public/StepsSection";
import { WhereSerialSection } from "@/components/public/WhereSerialSection";
import type { SerialDatabaseStatus } from "@/db/schema";
import { CONTACT, MODELS } from "@/lib/copy/es";
import { getSerialDatabaseStatus } from "@/lib/recall/verify";

// El estado de la base de series se lee en cada petición (no debe quedar congelado en el build).
export const dynamic = "force-dynamic";

/** Fecha de "última actualización": NEXT_PUBLIC_LAST_UPDATED (ISO) o el arranque del servidor. */
const LAST_UPDATED = (() => {
  const raw = process.env.NEXT_PUBLIC_LAST_UPDATED?.trim();
  // Una fecha sin hora (2026-10-27) se interpreta al mediodía UTC para que no cambie de día en America/Santiago.
  const d = raw ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00Z` : raw) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
})();

function formatLastUpdated(d: Date): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(d);
}

export default async function Page() {
  let serialDbStatus: SerialDatabaseStatus = "PENDING";
  try {
    serialDbStatus = await getSerialDatabaseStatus();
  } catch (err) {
    console.error("[page] no se pudo leer el estado de la base de series; se asume PENDING", err);
  }

  const contact = {
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || CONTACT.defaultEmail,
    whatsapp: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP,
    hours: process.env.NEXT_PUBLIC_CONTACT_HOURS,
  };
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;

  // Fotografías oficiales de los modelos: se muestran solo si el archivo existe en /public.
  const availableImages = Object.fromEntries(
    MODELS.items.map((m) => [m.key, fs.existsSync(path.join(process.cwd(), "public", m.image))]),
  );

  return (
    <>
      <PageViewTracker />
      <SiteHeader />
      <main id="contenido">
        <RecallFlow serialDbStatus={serialDbStatus} turnstileSiteKey={turnstileSiteKey} />
        <StepsSection />
        <SafetySection />
        <ModelsSection availableImages={availableImages} />
        <WhereSerialSection />
        <FaqSection />
        <ContactSection contact={contact} />
      </main>
      <SiteFooter lastUpdated={formatLastUpdated(LAST_UPDATED)} />
    </>
  );
}
