/**
 * Plantillas de correo (funciones puras, sin acceso a BD).
 * TODO EL TEXTO EN ESPAÑOL. Los datos del usuario se escapan en HTML.
 */
import type { RecallCase } from "@/db/schema";
import { BRAND, CONTACT, EMAIL, RESULT_AFFECTED, RESULT_NOT_IDENTIFIED, RESULT_REINFORCED, STATUS_LABELS } from "@/lib/copy/es";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Subconjunto del caso necesario para los correos. */
export type CaseEmailData = Pick<
  RecallCase,
  | "caseId"
  | "customerName"
  | "email"
  | "phone"
  | "rut"
  | "region"
  | "city"
  | "serialNumber"
  | "model"
  | "size"
  | "requestType"
  | "serialVerificationStatus"
  | "priority"
  | "damageReported"
  | "accidentReported"
  | "caseStatus"
  | "createdAt"
>;

export interface EmailContext {
  siteUrl: string;
  contactEmail?: string;
  contactWhatsapp?: string;
  contactHours?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function contactLines(ctx: EmailContext): string[] {
  const lines: string[] = [CONTACT.team, CONTACT.company];
  const hasAny = Boolean(ctx.contactEmail || ctx.contactWhatsapp);
  if (ctx.contactEmail) lines.push(`${CONTACT.emailLabel}: ${ctx.contactEmail}`);
  if (ctx.contactWhatsapp) lines.push(`${CONTACT.whatsappLabel}: ${ctx.contactWhatsapp}`);
  if (ctx.contactHours) lines.push(`${CONTACT.hoursLabel}: ${ctx.contactHours}`);
  if (!hasAny) lines.push(`Canales de contacto: se informarán en ${BRAND.domain}`);
  return lines;
}

function siteLine(ctx: EmailContext): string {
  return `${EMAIL.siteLink} ${ctx.siteUrl}`;
}

/** Envuelve párrafos de texto plano en un HTML sencillo con estilos en línea. */
function wrapHtml(title: string, blocks: HtmlBlock[]): string {
  const body = blocks
    .map((b) => {
      switch (b.type) {
        case "alert":
          return `<p style="margin:0 0 16px;padding:14px 16px;background:#fdeced;border-left:4px solid #d1121c;color:#a60d15;font-weight:700;font-size:16px;">${escapeHtml(b.text)}</p>`;
        case "caution":
          return `<p style="margin:0 0 16px;padding:14px 16px;background:#f5f5f6;border-left:4px solid #0b0b0c;color:#0b0b0c;font-weight:700;font-size:15px;">${escapeHtml(b.text)}</p>`;
        case "kv":
          return `<table role="presentation" style="margin:0 0 16px;border-collapse:collapse;font-size:15px;">${b.rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:4px 12px 4px 0;color:#55555c;">${escapeHtml(k)}</td><td style="padding:4px 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;">${escapeHtml(v)}</td></tr>`,
            )
            .join("")}</table>`;
        case "small":
          return `<p style="margin:0 0 8px;color:#55555c;font-size:13px;">${escapeHtml(b.text)}</p>`;
        case "heading":
          return `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.2;text-transform:uppercase;letter-spacing:-0.01em;">${escapeHtml(b.text)}</h1>`;
        case "p":
        default:
          return `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${escapeHtml(b.text).replace(/\n/g, "<br>")}</p>`;
      }
    })
    .join("\n");
  return `<!doctype html>
<html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f6;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0b0b0c;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
<div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#55555c;margin-bottom:12px;">${escapeHtml(BRAND.product)} · Recall de Seguridad · Chile</div>
<div style="background:#ffffff;padding:24px;border:1px solid #d9d9dd;">
${body}
</div>
<p style="margin:16px 0 0;color:#a1a1aa;font-size:12px;">${escapeHtml(EMAIL.footer)}</p>
</div></body></html>`;
}

type HtmlBlock =
  | { type: "heading"; text: string }
  | { type: "p"; text: string }
  | { type: "alert"; text: string }
  | { type: "caution"; text: string }
  | { type: "small"; text: string }
  | { type: "kv"; rows: [string, string][] };

const STOP_RIDING_SOFT = "Hasta recibir confirmación, recomendamos no utilizar la bicicleta.";

/** Confirmación de registro al cliente (según tipo de solicitud). */
export function customerConfirmationEmail(c: CaseEmailData, ctx: EmailContext): RenderedEmail {
  const subject =
    c.requestType === "REPLACEMENT"
      ? EMAIL.customerSubject
      : c.requestType === "PENDING_DATABASE"
        ? EMAIL.customerSubjectPending
        : EMAIL.customerSubjectManualReview;

  const safety = c.requestType === "MANUAL_REVIEW" ? STOP_RIDING_SOFT : EMAIL.stopRiding;
  const next =
    c.requestType === "REPLACEMENT"
      ? EMAIL.nextSteps
      : c.requestType === "PENDING_DATABASE"
        ? EMAIL.nextStepsPending
        : EMAIL.nextStepsManualReview;

  const intro =
    c.requestType === "REPLACEMENT"
      ? "Hemos recibido tu solicitud de reemplazo de cuadro dentro de la campaña de recall de seguridad Polygon Collosus DH en Chile."
      : c.requestType === "PENDING_DATABASE"
        ? "Hemos recibido el registro de tu bicicleta dentro de la campaña de recall de seguridad Polygon Collosus DH en Chile."
        : "Hemos recibido tu solicitud de revisión manual dentro de la campaña de recall de seguridad Polygon Collosus DH en Chile.";

  const contact = contactLines(ctx);
  const text = [
    EMAIL.greeting(c.customerName),
    "",
    intro,
    "",
    safety,
    "",
    `${EMAIL.caseIdLabel}: ${c.caseId}`,
    `${EMAIL.serialLabel}: ${c.serialNumber}`,
    "",
    next,
    EMAIL.keepCaseId,
    "",
    ...contact,
    "",
    siteLine(ctx),
    "",
    EMAIL.signature,
    "",
    EMAIL.footer,
  ].join("\n");

  const html = wrapHtml(subject, [
    { type: "heading", text: "Hemos recibido tu solicitud" },
    { type: "p", text: EMAIL.greeting(c.customerName) },
    { type: "p", text: intro },
    c.requestType === "MANUAL_REVIEW" ? { type: "caution", text: safety } : { type: "alert", text: safety },
    {
      type: "kv",
      rows: [
        [EMAIL.caseIdLabel, c.caseId],
        [EMAIL.serialLabel, c.serialNumber],
      ],
    },
    { type: "p", text: next },
    { type: "small", text: EMAIL.keepCaseId },
    { type: "p", text: contact.join("\n") },
    { type: "small", text: siteLine(ctx) },
    { type: "p", text: EMAIL.signature },
  ]);

  return { subject, text, html };
}

/** Alerta interna a Postventa por nuevo caso. */
export function internalNotificationEmail(c: CaseEmailData, ctx: EmailContext): RenderedEmail {
  const high = c.priority === "HIGH";
  const subject = EMAIL.internalSubject(c.caseId, high);
  const link = `${ctx.siteUrl.replace(/\/$/, "")}/admin/casos/${encodeURIComponent(c.caseId)}`;
  const rows: [string, string][] = [
    ["Número de caso", c.caseId],
    ["Prioridad", STATUS_LABELS.priority[c.priority]],
    ["Tipo de solicitud", STATUS_LABELS.requestType[c.requestType]],
    ["Verificación de serie", STATUS_LABELS.verification[c.serialVerificationStatus]],
    ["Estado del caso", STATUS_LABELS.caseStatus[c.caseStatus]],
    ["Cliente", c.customerName],
    ["RUT", c.rut],
    ["Teléfono", c.phone],
    ["Correo", c.email],
    ["Región / ciudad", `${c.region} / ${c.city}`],
    ["Número de serie", c.serialNumber],
    ["Modelo", STATUS_LABELS.model[c.model]],
    ["Talla", STATUS_LABELS.size[c.size]],
    ["Daño reportado", STATUS_LABELS.tri[c.damageReported]],
    ["Accidente reportado", c.accidentReported ? "Sí" : "No"],
    ["Fecha de registro", c.createdAt.toISOString()],
  ];
  const text = [
    high ? "*** ALTA PRIORIDAD: el cliente reporta un incidente o caída ***" : "Nuevo caso registrado en el portal de recall.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `Ver caso: ${link}`,
    "",
    EMAIL.footer,
  ].join("\n");
  const html = wrapHtml(subject, [
    { type: "heading", text: `Nuevo caso ${c.caseId}` },
    high
      ? { type: "alert", text: "ALTA PRIORIDAD: el cliente reporta un incidente o caída." }
      : { type: "p", text: "Nuevo caso registrado en el portal de recall." },
    { type: "kv", rows },
    { type: "p", text: `Ver caso: ${link}` },
  ]);
  return { subject, text, html };
}

/** Resultado tras reproceso: la unidad SÍ está incluida en el recall. */
export function customerResultAffectedEmail(c: CaseEmailData, ctx: EmailContext): RenderedEmail {
  const subject = EMAIL.resultAffectedSubject;
  const contact = contactLines(ctx);
  const text = [
    EMAIL.greeting(c.customerName),
    "",
    `${RESULT_AFFECTED.title}.`,
    "",
    EMAIL.stopRiding,
    "",
    RESULT_AFFECTED.body1,
    RESULT_AFFECTED.body2,
    RESULT_AFFECTED.body3,
    "",
    `${EMAIL.caseIdLabel}: ${c.caseId}`,
    `${EMAIL.serialLabel}: ${c.serialNumber}`,
    "",
    EMAIL.nextSteps,
    "",
    ...contact,
    "",
    siteLine(ctx),
    "",
    EMAIL.signature,
    "",
    EMAIL.footer,
  ].join("\n");
  const html = wrapHtml(subject, [
    { type: "heading", text: RESULT_AFFECTED.title },
    { type: "p", text: EMAIL.greeting(c.customerName) },
    { type: "alert", text: EMAIL.stopRiding },
    { type: "p", text: RESULT_AFFECTED.body1 },
    { type: "p", text: RESULT_AFFECTED.body2 },
    { type: "p", text: RESULT_AFFECTED.body3 },
    {
      type: "kv",
      rows: [
        [EMAIL.caseIdLabel, c.caseId],
        [EMAIL.serialLabel, c.serialNumber],
      ],
    },
    { type: "p", text: EMAIL.nextSteps },
    { type: "p", text: contact.join("\n") },
    { type: "small", text: siteLine(ctx) },
    { type: "p", text: EMAIL.signature },
  ]);
  return { subject, text, html };
}

/** Resultado tras reproceso: la serie no aparece en la base oficial. NUNCA certifica seguridad. */
export function customerResultNotIdentifiedEmail(c: CaseEmailData, ctx: EmailContext): RenderedEmail {
  const subject = EMAIL.resultNotIdentifiedSubject;
  const contact = contactLines(ctx);
  const text = [
    EMAIL.greeting(c.customerName),
    "",
    "Polygon Bikes nos ha entregado la base de números de serie de las unidades incluidas en esta campaña y hemos verificado tu registro.",
    "",
    `${RESULT_NOT_IDENTIFIED.title}.`,
    "",
    RESULT_NOT_IDENTIFIED.body1,
    RESULT_NOT_IDENTIFIED.body2,
    RESULT_NOT_IDENTIFIED.body3,
    "",
    `${EMAIL.caseIdLabel}: ${c.caseId}`,
    `${EMAIL.serialLabel}: ${c.serialNumber}`,
    "",
    "Si tienes dudas o deseas solicitar una revisión de tu bicicleta, responde a este correo o contáctanos por los canales indicados.",
    "",
    ...contact,
    "",
    siteLine(ctx),
    "",
    EMAIL.signature,
    "",
    EMAIL.footer,
  ].join("\n");
  const html = wrapHtml(subject, [
    { type: "heading", text: "Resultado de verificación" },
    { type: "p", text: EMAIL.greeting(c.customerName) },
    {
      type: "p",
      text: "Polygon Bikes nos ha entregado la base de números de serie de las unidades incluidas en esta campaña y hemos verificado tu registro.",
    },
    { type: "caution", text: RESULT_NOT_IDENTIFIED.title },
    { type: "p", text: RESULT_NOT_IDENTIFIED.body1 },
    { type: "p", text: RESULT_NOT_IDENTIFIED.body2 },
    { type: "p", text: RESULT_NOT_IDENTIFIED.body3 },
    {
      type: "kv",
      rows: [
        [EMAIL.caseIdLabel, c.caseId],
        [EMAIL.serialLabel, c.serialNumber],
      ],
    },
    {
      type: "p",
      text: "Si tienes dudas o deseas solicitar una revisión de tu bicicleta, responde a este correo o contáctanos por los canales indicados.",
    },
    { type: "p", text: contact.join("\n") },
    { type: "small", text: siteLine(ctx) },
    { type: "p", text: EMAIL.signature },
  ]);
  return { subject, text, html };
}

/**
 * Resultado tras reproceso: la serie corresponde a la tanda reforzada (no incluida en la campaña).
 * Usa el texto BORRADOR de RESULT_REINFORCED, pendiente de revisión legal. NUNCA certifica seguridad.
 */
export function customerResultReinforcedEmail(c: CaseEmailData, ctx: EmailContext): RenderedEmail {
  const subject = EMAIL.resultNotIdentifiedSubject;
  const contact = contactLines(ctx);
  const intro = "Polygon Bikes nos ha entregado la base de números de serie de esta campaña y hemos verificado tu registro.";
  const help = "Si tienes dudas, responde a este correo o contáctanos por los canales indicados.";
  const text = [
    EMAIL.greeting(c.customerName),
    "",
    intro,
    "",
    `${RESULT_REINFORCED.title}.`,
    "",
    RESULT_REINFORCED.body1,
    RESULT_REINFORCED.body2,
    RESULT_REINFORCED.body3,
    "",
    `${EMAIL.caseIdLabel}: ${c.caseId}`,
    `${EMAIL.serialLabel}: ${c.serialNumber}`,
    "",
    help,
    "",
    ...contact,
    "",
    siteLine(ctx),
    "",
    EMAIL.signature,
    "",
    EMAIL.footer,
  ].join("\n");
  const html = wrapHtml(subject, [
    { type: "heading", text: "Resultado de verificación" },
    { type: "p", text: EMAIL.greeting(c.customerName) },
    { type: "p", text: intro },
    { type: "heading", text: RESULT_REINFORCED.title },
    { type: "p", text: RESULT_REINFORCED.body1 },
    { type: "p", text: RESULT_REINFORCED.body2 },
    { type: "p", text: RESULT_REINFORCED.body3 },
    {
      type: "kv",
      rows: [
        [EMAIL.caseIdLabel, c.caseId],
        [EMAIL.serialLabel, c.serialNumber],
      ],
    },
    { type: "p", text: help },
    { type: "p", text: contact.join("\n") },
    { type: "small", text: siteLine(ctx) },
    { type: "p", text: EMAIL.signature },
  ]);
  return { subject, text, html };
}
