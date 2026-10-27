import { ContactSection } from "@/components/public/ContactSection";
import { FaqSection } from "@/components/public/FaqSection";
import { PageViewTracker } from "@/components/public/PageViewTracker";
import { RecallFlow } from "@/components/public/RecallFlow";
import { SafetySection } from "@/components/public/SafetySection";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SiteHeader } from "@/components/public/SiteHeader";
import { StepsSection } from "@/components/public/StepsSection";
import { WhereSerialSection } from "@/components/public/WhereSerialSection";
import type { SerialDatabaseStatus } from "@/db/schema";
import { getSerialDatabaseStatus } from "@/lib/recall/verify";

// El estado de la base de series se lee en cada petición (no debe quedar congelado en el build).
export const dynamic = "force-dynamic";

/** Fecha de "última actualización": NEXT_PUBLIC_LAST_UPDATED (ISO) o el arranque del servidor. */
const LAST_UPDATED = (() => {
  const raw = process.env.NEXT_PUBLIC_LAST_UPDATED;
  const d = raw ? new Date(raw) : new Date();
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
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
    whatsapp: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP,
    hours: process.env.NEXT_PUBLIC_CONTACT_HOURS,
  };
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;

  return (
    <>
      <PageViewTracker />
      <SiteHeader />
      <main id="contenido">
        <RecallFlow serialDbStatus={serialDbStatus} turnstileSiteKey={turnstileSiteKey} />
        <StepsSection />
        <SafetySection />
        <WhereSerialSection />
        <FaqSection />
        <ContactSection contact={contact} />
      </main>
      <SiteFooter lastUpdated={formatLastUpdated(LAST_UPDATED)} />
    </>
  );
}
