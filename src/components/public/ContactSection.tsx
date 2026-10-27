"use client";

import { track } from "@/lib/analytics-client";
import { CONTACT } from "@/lib/copy/es";
import { Container, SectionTitle } from "./ui";

export interface ContactInfo {
  email?: string;
  whatsapp?: string;
  hours?: string;
}

function whatsappHref(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

/** Datos de contacto. WhatsApp y horario se muestran solo si están definidos; nunca se inventan. */
export function ContactSection({ contact }: { contact: ContactInfo }) {
  const email = contact.email?.trim() || "";
  const whatsapp = contact.whatsapp?.trim() || "";
  const hours = contact.hours?.trim() || "";
  const waHref = whatsapp ? whatsappHref(whatsapp) : null;

  return (
    <section id="contacto" aria-labelledby="contacto-titulo" className="border-t border-line bg-paper-100 py-14 sm:py-20">
      <Container>
        <SectionTitle id="contacto-titulo">{CONTACT.title}</SectionTitle>
        <div className="rounded-md border-t-4 border-ink bg-paper p-6 sm:p-8">
          <p className="headline text-[28px] text-ink" translate="no">
            {CONTACT.name}
          </p>
          <p className="mt-1 text-[15px] text-ink-700">{CONTACT.role}</p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{CONTACT.channelsTitle}</h3>
          <ul className="mt-2 space-y-2">
            {email ? (
              <li>
                <a
                  href={`mailto:${email}`}
                  onClick={() => track("contact_clicked")}
                  className="break-all text-[18px] font-semibold text-ink underline underline-offset-4 hover:text-ink-700 sm:text-[20px]"
                >
                  {email}
                </a>
              </li>
            ) : (
              <li className="text-[15px] text-ink-500">{CONTACT.pendingNotice}</li>
            )}
            {whatsapp ? (
              <li className="text-[15px] text-ink">
                <span className="text-ink-500">{CONTACT.whatsappLabel}: </span>
                {waHref ? (
                  <a href={waHref} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4" onClick={() => track("contact_clicked")}>
                    {whatsapp}
                  </a>
                ) : (
                  whatsapp
                )}
              </li>
            ) : null}
            {hours ? (
              <li className="text-[15px] text-ink">
                <span className="text-ink-500">{CONTACT.hoursLabel}: </span>
                {hours}
              </li>
            ) : null}
          </ul>
        </div>
      </Container>
    </section>
  );
}
