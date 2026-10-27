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

/** Datos de contacto. Si un dato no está definido, se muestra "[POR DEFINIR]"; nunca se inventa. */
export function ContactSection({ contact }: { contact: ContactInfo }) {
  const email = contact.email?.trim() || "";
  const whatsapp = contact.whatsapp?.trim() || "";
  const hours = contact.hours?.trim() || "";
  const anyPending = !email || !whatsapp || !hours;
  const waHref = whatsapp ? whatsappHref(whatsapp) : null;

  return (
    <section id="contacto" aria-labelledby="contacto-titulo" className="border-t border-line bg-paper-100 py-14 sm:py-20">
      <Container>
        <SectionTitle id="contacto-titulo">{CONTACT.title}</SectionTitle>
        <div className="rounded-md border border-line bg-paper p-6 sm:p-8">
          <p className="text-[17px] font-bold text-ink">{CONTACT.team}</p>
          <p className="text-[15px] text-ink-700">{CONTACT.company}</p>
          <p className="text-[15px] text-ink-500">{CONTACT.role}</p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{CONTACT.emailLabel}</dt>
              <dd className="mt-1 break-all text-[15px] font-medium text-ink">
                {email ? (
                  <a href={`mailto:${email}`} className="underline underline-offset-4" onClick={() => track("contact_clicked")}>
                    {email}
                  </a>
                ) : (
                  <span className="text-ink-500">{CONTACT.toDefine}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{CONTACT.whatsappLabel}</dt>
              <dd className="mt-1 text-[15px] font-medium text-ink">
                {whatsapp ? (
                  waHref ? (
                    <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" onClick={() => track("contact_clicked")}>
                      {whatsapp}
                    </a>
                  ) : (
                    whatsapp
                  )
                ) : (
                  <span className="text-ink-500">{CONTACT.toDefine}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{CONTACT.hoursLabel}</dt>
              <dd className="mt-1 text-[15px] font-medium text-ink">{hours ? hours : <span className="text-ink-500">{CONTACT.toDefine}</span>}</dd>
            </div>
          </dl>

          {anyPending ? <p className="mt-6 text-sm text-ink-500">{CONTACT.pendingNotice}</p> : null}
        </div>
      </Container>
    </section>
  );
}
