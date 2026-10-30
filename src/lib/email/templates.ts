/**
 * Plantillas de correo (funciones puras, sin acceso a BD).
 * TODO EL TEXTO EN ESPAÑOL. Los datos del usuario se escapan en HTML.
 */
import type { RecallCase } from "@/db/schema";
import { BRAND, CONTACT, EMAIL, FOLLOW_UP, HERO, MODELS, OUTREACH, RESULT_AFFECTED, RESULT_NOT_IDENTIFIED, RESULT_REINFORCED, STATUS_LABELS } from "@/lib/copy/es";

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

/** Enlace visible para el cliente: con "www." (pedido de Cross Mountain); www redirige al dominio principal. */
function publicUrl(ctx: EmailContext): string {
  return ctx.siteUrl.replace(/\/$/, "").replace(/^https:\/\/(?!www\.)/, "https://www.");
}

function siteLine(ctx: EmailContext): string {
  return `${EMAIL.siteLink} ${publicUrl(ctx)}`;
}

// Colores del sitio (src/app/globals.css). Los correos no leen CSS externo: todo va en línea.
const C = {
  ink: "#0b0b0c",
  ink500: "#55555c",
  muted: "#8a8a93",
  line: "#d9d9dd",
  paper: "#ffffff",
  paper100: "#f5f5f6",
  alert: "#d1121c",
  alert700: "#a60d15",
  alert50: "#fdeced",
  ok: "#15803d",
  ok700: "#166534",
  ok50: "#f0fdf4",
} as const;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

/** Color de la franja superior: rojo (afectada / reemplazo), verde (no afectada) o negro (resto). */
type Tone = "alert" | "ok" | "neutral";
const TONE_COLOR: Record<Tone, string> = { alert: C.alert, ok: C.ok, neutral: C.ink };

/** Texto escapado con saltos de línea, URLs y correos clicables. */
function richText(value: string): string {
  return escapeHtml(value)
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:${C.ink};text-decoration:underline;">${url}</a>`)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (mail) => `<a href="mailto:${mail}" style="color:${C.ink};text-decoration:underline;">${mail}</a>`)
    .replace(/\n/g, "<br>");
}

function renderBlock(b: HtmlBlock): string {
  switch (b.type) {
    case "heading":
      return `<h1 style="margin:0 0 20px;font-size:24px;line-height:1.15;font-weight:800;text-transform:uppercase;letter-spacing:-0.01em;color:${C.ink};">${escapeHtml(b.text)}</h1>`;
    case "alert":
    case "ok":
    case "caution": {
      const [bg, bar, fg] = b.type === "alert" ? [C.alert50, C.alert, C.alert700] : b.type === "ok" ? [C.ok50, C.ok, C.ok700] : [C.paper100, C.ink, C.ink];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;"><tr><td style="background:${bg};border-left:4px solid ${bar};padding:14px 16px;color:${fg};font-size:15px;line-height:1.45;font-weight:700;">${richText(b.text)}</td></tr></table>`;
    }
    case "kv":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-collapse:collapse;border:1px solid ${C.line};">${b.rows
        .map(
          ([k, v], i) =>
            `<tr><td style="padding:10px 14px;${i ? `border-top:1px solid ${C.line};` : ""}font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink500};width:42%;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:10px 14px;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${/número|rut/i.test(k) ? MONO : FONT};font-size:14px;font-weight:700;color:${C.ink};word-break:break-word;">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-collapse:collapse;"><tr><td style="background:${C.ink};"><a href="${escapeHtml(b.href)}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${escapeHtml(b.label)}</a></td></tr></table>`;
    case "contact":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-collapse:collapse;"><tr><td style="background:${C.paper100};padding:16px 18px;"><p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink500};">${escapeHtml(CONTACT.title)}</p><p style="margin:0;font-size:14px;line-height:1.55;color:${C.ink};">${richText(b.lines.join("\n"))}</p></td></tr></table>`;
    case "models":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-collapse:collapse;"><tr>${b.items
        .map(
          (m, i) =>
            `<td width="50%" style="width:50%;vertical-align:top;${i ? "padding-left:6px;" : "padding-right:6px;"}"><img src="${escapeHtml(m.src)}" width="270" alt="${escapeHtml(m.alt)}" style="display:block;border:0;width:100%;max-width:270px;height:auto;margin:0 auto;font-size:12px;color:${C.ink500};"><p style="margin:8px 0 0;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.02em;color:${C.ink};text-align:center;">${escapeHtml(m.name)}</p><p style="margin:2px 0 0;font-size:12px;line-height:1.4;color:${C.ink500};text-align:center;">${escapeHtml(m.caption)}</p></td>`,
        )
        .join("")}</tr></table>`;
    case "box":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-collapse:collapse;border:1px dashed ${C.line};"><tr><td style="padding:16px 18px;"><p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink500};">${escapeHtml(b.title)}</p><p style="margin:0;font-size:14px;line-height:1.55;color:${C.ink};">${richText(b.text)}</p></td></tr></table>`;
    case "signature":
      return `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${C.line};font-size:13px;line-height:1.5;color:${C.ink500};">${richText(b.text)}</p>`;
    case "small":
      return `<p style="margin:0 0 10px;color:${C.ink500};font-size:13px;line-height:1.5;">${richText(b.text)}</p>`;
    case "p":
    default:
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${C.ink};">${richText(b.text)}</p>`;
  }
}

/** Envuelve los bloques en un correo HTML con tablas y estilos en línea (compatible con Gmail y Outlook). */
function wrapHtml(title: string, blocks: HtmlBlock[], opts: { siteUrl: string; tone?: Tone }): string {
  const base = opts.siteUrl.replace(/\/$/, "");
  const bar = TONE_COLOR[opts.tone ?? "neutral"];
  return `<!doctype html>
<html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${C.paper100};font-family:${FONT};color:${C.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper100};border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-collapse:collapse;">
<tr><td style="padding:0 4px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
<td style="vertical-align:middle;"><img src="${base}/brand/polygon-logo.png" width="120" height="27" alt="POLYGON" style="display:block;border:0;width:120px;height:auto;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:0.08em;color:${C.ink};"></td>
<td align="right" style="vertical-align:middle;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.ink500};">Aviso de suspensión de uso · Chile</td>
</tr></table>
</td></tr>
<tr><td style="background:${C.paper};border:1px solid ${C.line};border-top:6px solid ${bar};padding:28px 24px 24px;">
${blocks.map(renderBlock).join("\n")}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:${C.muted};">${escapeHtml(EMAIL.footer)}<br>${escapeHtml(BRAND.distributor)} · <a href="${base}" style="color:${C.muted};text-decoration:underline;">${escapeHtml(BRAND.domain)}</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
}

type HtmlBlock =
  | { type: "heading"; text: string }
  | { type: "p"; text: string }
  | { type: "alert"; text: string }
  | { type: "ok"; text: string }
  | { type: "caution"; text: string }
  | { type: "small"; text: string }
  | { type: "kv"; rows: [string, string][] }
  | { type: "button"; label: string; href: string }
  | { type: "contact"; lines: string[] }
  | { type: "box"; title: string; text: string }
  | { type: "models"; items: { src: string; alt: string; name: string; caption: string }[] }
  | { type: "signature"; text: string };

/** Fotos de los dos modelos incluidos. JPG con fondo blanco en /correo (Outlook no muestra WebP). */
function modelsBlock(ctx: EmailContext): HtmlBlock {
  const base = ctx.siteUrl.replace(/\/$/, "");
  return {
    type: "models",
    items: MODELS.items.map((m) => ({ src: `${base}/correo/collosus-${m.key}.jpg`, alt: m.alt, name: m.name, caption: m.description })),
  };
}

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
      ? "Hemos recibido tu solicitud de reemplazo de cuadro dentro de la campaña de seguridad Polygon Collosus DH en Chile."
      : c.requestType === "PENDING_DATABASE"
        ? "Hemos recibido el registro de tu bicicleta dentro de la campaña de seguridad Polygon Collosus DH en Chile."
        : "Hemos recibido tu solicitud de revisión manual dentro de la campaña de seguridad Polygon Collosus DH en Chile.";

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
    { type: "contact", lines: contact.filter((l) => l !== CONTACT.team && l !== CONTACT.company) },
    { type: "small", text: siteLine(ctx) },
    { type: "signature", text: EMAIL.signature },
  ], { siteUrl: ctx.siteUrl, tone: c.requestType === "REPLACEMENT" ? "alert" : "neutral" });

  return { subject, text, html };
}

/** Alerta interna a Postventa por nuevo caso. */
export function internalNotificationEmail(c: CaseEmailData, ctx: EmailContext): RenderedEmail {
  const high = c.priority === "HIGH";
  const subject = EMAIL.internalSubject(c.caseId, high);
  // Alta prioridad: incidente o caída (formularios antiguos) o serie no afectada con daño visible.
  const highReason = c.accidentReported
    ? "ALTA PRIORIDAD: el cliente reporta un incidente o caída."
    : "ALTA PRIORIDAD: serie no afectada con daño reportado en el cuadro.";
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
    ["Fecha de registro", c.createdAt.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })],
  ];
  const text = [
    high ? `*** ${highReason} ***` : "Nuevo caso registrado en el portal de la campaña de seguridad.",
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
      ? { type: "alert", text: highReason }
      : { type: "p", text: "Nuevo caso registrado en el portal de la campaña de seguridad." },
    { type: "kv", rows },
    { type: "button", label: "Ver caso", href: link },
  ], { siteUrl: ctx.siteUrl, tone: high ? "alert" : "neutral" });
  return { subject, text, html };
}

/** Datos de una consulta afectada con correo (aún sin caso registrado). */
export interface AffectedContactEmailData {
  serial: string;
  email: string;
  outreachRef: string | null;
  createdAt: Date;
}

/** Alerta interna: alguien consultó una serie afectada y dejó su correo antes de ver el resultado. */
export function internalAffectedContactEmail(d: AffectedContactEmailData, ctx: EmailContext): RenderedEmail {
  const subject = `Serie afectada consultada · ${d.serial}`;
  const intro = "Una persona consultó una serie afectada y dejó su correo antes de ver el resultado. Aún no completa el registro: si no lo hace, contáctala a este correo.";
  const link = `${ctx.siteUrl.replace(/\/$/, "")}/admin/consultas?result=AFFECTED&q=${encodeURIComponent(d.serial)}`;
  const rows: [string, string][] = [
    ["Número de serie", d.serial],
    ["Correo", d.email],
    ["Código de enlace", d.outreachRef ?? "Sin código (no llegó por un enlace personal)"],
    ["Fecha de la consulta", d.createdAt.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })],
  ];
  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Ver consultas: ${link}`, "", EMAIL.footer].join("\n");
  const html = wrapHtml(subject, [
    { type: "heading", text: `Serie afectada ${d.serial}` },
    { type: "alert", text: intro },
    { type: "kv", rows },
    { type: "button", label: "Ver consultas", href: link },
  ], { siteUrl: ctx.siteUrl, tone: "alert" });
  return { subject, text, html };
}

/** Resultado tras reproceso: la unidad SÍ está incluida en la campaña de seguridad. */
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
    RESULT_AFFECTED.body4,
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
    { type: "p", text: RESULT_AFFECTED.body4 },
    {
      type: "kv",
      rows: [
        [EMAIL.caseIdLabel, c.caseId],
        [EMAIL.serialLabel, c.serialNumber],
      ],
    },
    { type: "p", text: EMAIL.nextSteps },
    { type: "contact", lines: contact.filter((l) => l !== CONTACT.team && l !== CONTACT.company) },
    { type: "small", text: siteLine(ctx) },
    { type: "signature", text: EMAIL.signature },
  ], { siteUrl: ctx.siteUrl, tone: "alert" });
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
    { type: "contact", lines: contact.filter((l) => l !== CONTACT.team && l !== CONTACT.company) },
    { type: "small", text: siteLine(ctx) },
    { type: "signature", text: EMAIL.signature },
  ], { siteUrl: ctx.siteUrl });
  return { subject, text, html };
}

/**
 * Resultado tras reproceso: la serie figura como OK en la lista de Polygon (no afectada, no incluida en la campaña).
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
    RESULT_REINFORCED.emailBody3,
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
    { type: "ok", text: RESULT_REINFORCED.title },
    { type: "p", text: RESULT_REINFORCED.body1 },
    { type: "p", text: RESULT_REINFORCED.body2 },
    { type: "p", text: RESULT_REINFORCED.emailBody3 },
    {
      type: "kv",
      rows: [
        [EMAIL.caseIdLabel, c.caseId],
        [EMAIL.serialLabel, c.serialNumber],
      ],
    },
    { type: "p", text: help },
    { type: "contact", lines: contact.filter((l) => l !== CONTACT.team && l !== CONTACT.company) },
    { type: "small", text: siteLine(ctx) },
    { type: "signature", text: EMAIL.signature },
  ], { siteUrl: ctx.siteUrl, tone: "ok" });
  return { subject, text, html };
}

/** Correo de prueba técnica (/api/health?email=1): mismo diseño que los correos reales, sin datos de clientes. */
export function testEmail(ctx: EmailContext): RenderedEmail {
  const subject = "Prueba de correo · Aviso de suspensión de uso Polygon Collosus DH";
  const body = "Correo de prueba del portal de la campaña de seguridad Polygon Collosus DH. Si lo recibes, el envío de correos funciona. No requiere ninguna acción.";
  const contact = contactLines(ctx);
  const text = [body, "", ...contact, "", siteLine(ctx), "", EMAIL.signature, "", EMAIL.footer].join("\n");
  const html = wrapHtml(subject, [
    { type: "heading", text: "Correo de prueba" },
    { type: "p", text: body },
    { type: "kv", rows: [["Número de caso", "RCDH-PRUEBA"], ["Número de serie", "A25012345"]] },
    { type: "contact", lines: contact.filter((l) => l !== CONTACT.team && l !== CONTACT.company) },
    { type: "small", text: siteLine(ctx) },
    { type: "signature", text: EMAIL.signature },
  ], { siteUrl: ctx.siteUrl });
  return { subject, text, html };
}

// ── Aviso directo (uno por destinatario, scripts/enviar-aviso.ts) ─────────

function contactEmailOf(ctx: EmailContext): string {
  return ctx.contactEmail || CONTACT.defaultEmail;
}

/** Aviso a quien compró una Polygon Collosus DH a Cross Mountain. */
export function outreachCustomerEmail(ctx: EmailContext): RenderedEmail {
  const t = OUTREACH.customer;
  const url = `${publicUrl(ctx)}/`;
  const help = `Ante cualquier duda, puedes escribirnos a ${contactEmailOf(ctx)}.`;
  const text = [t.greeting, "", t.body1, "", t.body2, "", t.body3, "", url, "", t.body4, "", t.body5, "", t.important, "", t.body6, "", help, "", "Saludos,", "", OUTREACH.signature, "", EMAIL.footer].join("\n");
  const html = wrapHtml(t.subject, [
    { type: "heading", text: t.heading },
    { type: "p", text: t.greeting },
    { type: "p", text: t.body1 },
    { type: "p", text: t.body2 },
    modelsBlock(ctx),
    { type: "p", text: t.body3 },
    { type: "button", label: HERO.cta, href: url },
    { type: "small", text: url },
    { type: "p", text: t.body4 },
    { type: "p", text: t.body5 },
    { type: "caution", text: t.important },
    { type: "p", text: t.body6 },
    { type: "p", text: help },
    { type: "signature", text: `Saludos,\n${OUTREACH.signature}` },
  ], { siteUrl: ctx.siteUrl });
  return { subject: t.subject, text, html };
}

/** Recordatorio a un cliente, con su enlace personal (?r=código) para saber si llegó a verificar. */
export function reminderCustomerEmail(ctx: EmailContext, ref: string): RenderedEmail {
  const t = OUTREACH.reminder;
  const url = `${publicUrl(ctx)}/?r=${encodeURIComponent(ref)}`;
  const help = `Ante cualquier duda, puedes escribirnos a ${contactEmailOf(ctx)}.`;
  const text = [t.greeting, "", t.body1, "", t.body2, "", url, "", t.body3, "", t.already, "", help, "", "Saludos,", "", OUTREACH.signature, "", EMAIL.footer].join("\n");
  const html = wrapHtml(t.subject, [
    { type: "heading", text: t.heading },
    { type: "p", text: t.greeting },
    { type: "p", text: t.body1 },
    modelsBlock(ctx),
    { type: "p", text: t.body2 },
    { type: "button", label: HERO.cta, href: url },
    { type: "small", text: url },
    { type: "p", text: t.body3 },
    { type: "caution", text: t.already },
    { type: "p", text: help },
    { type: "signature", text: `Saludos,\n${OUTREACH.signature}` },
  ], { siteUrl: ctx.siteUrl });
  return { subject: t.subject, text, html };
}

export type FollowUpKind = "STAGE" | "WEEKLY" | "BROADCAST";
export type FollowUpCaseData = Pick<RecallCase, "caseId" | "customerName" | "serialNumber" | "caseStatus">;

/** Etapas del caso con marcas: hechas (✓), actual (→) y pendientes (·). */
function stagesText(status: string): { current: string | null; text: string } {
  const idx = FOLLOW_UP.stages.findIndex(([s]) => s === status);
  const current = idx >= 0 ? FOLLOW_UP.stages[idx]![1] : null;
  const lines = FOLLOW_UP.stages.map(([, label], i) => (idx < 0 ? `· ${label}` : i < idx || (i === idx && status === "REPLACED") ? `✓ ${label}` : i === idx ? `→ ${label}` : `· ${label}`));
  return { current, text: lines.join("\n") };
}

/**
 * Seguimiento a un cliente con unidad afectada: cambio de etapa, novedad semanal o comunicado del panel.
 * Un comunicado lleva el asunto y el mensaje que escribe Postventa (texto plano).
 */
export function customerFollowUpEmail(c: FollowUpCaseData, kind: FollowUpKind, ctx: EmailContext, message?: { subject: string; body: string }): RenderedEmail {
  const { current, text: stages } = stagesText(c.caseStatus);
  const stageLabel = current ?? STATUS_LABELS.caseStatus[c.caseStatus];
  const replaced = c.caseStatus === "REPLACED";
  const t = kind === "BROADCAST" ? null : kind === "WEEKLY" ? FOLLOW_UP.weekly : replaced ? FOLLOW_UP.replaced : FOLLOW_UP.stage;
  const subject = message?.subject ?? (t ? t.subject(c.caseId) : FOLLOW_UP.broadcast.heading);
  const heading = t ? t.heading : FOLLOW_UP.broadcast.heading;
  const body = message?.body ?? (kind === "WEEKLY" ? FOLLOW_UP.weekly.body(stageLabel) : replaced ? FOLLOW_UP.replaced.body : FOLLOW_UP.stage.body(stageLabel));
  const contact = contactLines(ctx);
  const rows: [string, string][] = [
    [EMAIL.caseIdLabel, c.caseId],
    [EMAIL.serialLabel, c.serialNumber],
    [FOLLOW_UP.currentStageLabel, stageLabel],
  ];
  const text = [
    EMAIL.greeting(c.customerName), "", body, "", ...(replaced ? [] : [EMAIL.stopRiding, ""]),
    ...rows.map(([k, v]) => `${k}: ${v}`), "", `${FOLLOW_UP.stagesTitle}:`, stages, "", FOLLOW_UP.nextContact, "", ...contact, "", siteLine(ctx), "", EMAIL.signature, "", EMAIL.footer,
  ].join("\n");
  const html = wrapHtml(subject, [
    { type: "heading", text: heading },
    { type: "p", text: EMAIL.greeting(c.customerName) },
    { type: "p", text: body },
    ...(replaced ? [{ type: "ok" as const, text: FOLLOW_UP.replaced.heading }] : [{ type: "alert" as const, text: EMAIL.stopRiding }]),
    { type: "kv", rows },
    { type: "box", title: FOLLOW_UP.stagesTitle, text: stages },
    { type: "p", text: FOLLOW_UP.nextContact },
    { type: "contact", lines: contact.filter((l) => l !== CONTACT.team && l !== CONTACT.company) },
    { type: "small", text: siteLine(ctx) },
    { type: "signature", text: EMAIL.signature },
  ], { siteUrl: ctx.siteUrl, tone: replaced ? "ok" : "alert" });
  return { subject, text, html };
}

/** Comunicado del panel a quien dejó su correo con una serie afectada y aún no registra caso. */
export function contactBroadcastEmail(serials: string[], message: { subject: string; body: string }, ctx: EmailContext): RenderedEmail {
  const url = `${publicUrl(ctx)}/`;
  const help = `Ante cualquier duda, puedes escribirnos a ${contactEmailOf(ctx)}.`;
  const serialLine = `${EMAIL.serialLabel}: ${serials.join(", ")}`;
  const text = [OUTREACH.affectedReminder.greeting, "", message.body, "", EMAIL.stopRiding, "", serialLine, "", FOLLOW_UP.noCaseYet, url, "", help, "", "Saludos,", "", OUTREACH.signature, "", EMAIL.footer].join("\n");
  const html = wrapHtml(message.subject, [
    { type: "heading", text: FOLLOW_UP.broadcast.heading },
    { type: "p", text: OUTREACH.affectedReminder.greeting },
    { type: "p", text: message.body },
    { type: "alert", text: EMAIL.stopRiding },
    { type: "small", text: serialLine },
    { type: "p", text: FOLLOW_UP.noCaseYet },
    { type: "button", label: RESULT_AFFECTED.cta, href: url },
    { type: "p", text: help },
    { type: "signature", text: `Saludos,\n${OUTREACH.signature}` },
  ], { siteUrl: ctx.siteUrl, tone: "alert" });
  return { subject: message.subject, text, html };
}

/** Recordatorio automático a quien consultó una serie afectada, dejó su correo y no registró caso. */
export function affectedReminderEmail(serials: string[], ctx: EmailContext): RenderedEmail {
  const t = OUTREACH.affectedReminder;
  const url = `${publicUrl(ctx)}/`;
  const help = `Ante cualquier duda, puedes escribirnos a ${contactEmailOf(ctx)}.`;
  const body1 = t.body1(serials.join(", "));
  const text = [
    t.greeting, "", body1, "", `${RESULT_AFFECTED.subtitle}.`, RESULT_AFFECTED.body2, "", RESULT_AFFECTED.body3, "", t.body2, "", url, "", t.already, "", help, "", "Saludos,", "", OUTREACH.signature, "", EMAIL.footer,
  ].join("\n");
  const html = wrapHtml(t.subject, [
    { type: "heading", text: t.heading },
    { type: "p", text: t.greeting },
    { type: "p", text: body1 },
    { type: "alert", text: `${RESULT_AFFECTED.subtitle}. ${RESULT_AFFECTED.body2}` },
    { type: "p", text: RESULT_AFFECTED.body3 },
    { type: "p", text: t.body2 },
    { type: "button", label: RESULT_AFFECTED.cta, href: url },
    { type: "small", text: url },
    { type: "caution", text: t.already },
    { type: "p", text: help },
    { type: "signature", text: `Saludos,\n${OUTREACH.signature}` },
  ], { siteUrl: ctx.siteUrl });
  return { subject: t.subject, text, html };
}

/** Aviso a distribuidores (ventas de MAYORISTA CROSSPORTS): revisar stock y contactar a sus clientes sin publicar. */
export function outreachDistributorEmail(ctx: EmailContext): RenderedEmail {
  const t = OUTREACH.distributor;
  const url = `${publicUrl(ctx)}/`;
  const mail = contactEmailOf(ctx);
  const forward = t.forward(url, mail);
  const text = [
    t.greeting, "", t.body1, "", t.body2, "", t.body3, "", url, "", t.actionsTitle, "", t.action1, t.action2, "", t.body4, "", t.stock(mail), "", t.private, "", t.body5, "", "Saludos,", "", OUTREACH.signature,
    "", `--- ${t.forwardTitle} ---`, "", forward, "", EMAIL.footer,
  ].join("\n");
  const html = wrapHtml(t.subject, [
    { type: "heading", text: t.heading },
    { type: "p", text: t.greeting },
    { type: "p", text: t.body1 },
    { type: "p", text: t.body2 },
    modelsBlock(ctx),
    { type: "p", text: t.body3 },
    { type: "button", label: HERO.cta, href: url },
    { type: "small", text: url },
    { type: "p", text: `${t.actionsTitle}\n\n${t.action1}\n\n${t.action2}` },
    { type: "p", text: t.body4 },
    { type: "alert", text: t.stock(mail) },
    { type: "caution", text: t.private },
    { type: "p", text: t.body5 },
    { type: "box", title: t.forwardTitle, text: forward },
    { type: "signature", text: `Saludos,\n${OUTREACH.signature}` },
  ], { siteUrl: ctx.siteUrl });
  return { subject: t.subject, text, html };
}

// ── Mesa de control ────────────────────────────────────────────────────

/**
 * Correo escrito por Postventa desde la bandeja (respuesta o mensaje nuevo). El cuerpo es texto plano
 * del panel (puede partir de una plantilla); se agrega la referencia del caso y la firma.
 */
export function manualEmail(c: Pick<RecallCase, "caseId" | "serialNumber"> | null, message: { subject: string; body: string }, ctx: EmailContext): RenderedEmail {
  const rows: [string, string][] = c ? [[EMAIL.caseIdLabel, c.caseId], [EMAIL.serialLabel, c.serialNumber]] : [];
  const contact = contactLines(ctx);
  const text = [message.body, "", ...rows.map(([k, v]) => `${k}: ${v}`), ...(rows.length ? [""] : []), EMAIL.signature, "", siteLine(ctx), "", EMAIL.footer].join("\n");
  const html = wrapHtml(message.subject, [
    { type: "p", text: message.body },
    ...(rows.length ? [{ type: "kv" as const, rows }] : []),
    { type: "contact", lines: contact.filter((l) => l !== CONTACT.team && l !== CONTACT.company) },
    { type: "signature", text: EMAIL.signature },
  ], { siteUrl: ctx.siteUrl });
  return { subject: message.subject, text, html };
}

export interface UrgentMessageEmailData {
  caseId: string | null;
  customerName: string | null;
  phone: string | null;
  fromEmail: string;
  subject: string;
  reason: string;
  excerpt: string;
  messageId: string;
}

/** Alerta interna: llegó un correo de alta prioridad, hay que llamar al cliente. */
export function internalUrgentMessageEmail(d: UrgentMessageEmailData, ctx: EmailContext): RenderedEmail {
  const base = ctx.siteUrl.replace(/\/$/, "");
  const subject = `LLAMAR AHORA · ${d.caseId ?? d.fromEmail} · correo de alta prioridad`;
  const intro = "Llegó un correo de alta prioridad a la mesa de control. Llama al cliente lo antes posible y marca la llamada en el panel.";
  const link = `${base}/admin/bandeja/${d.messageId}`;
  const rows: [string, string][] = [
    ["Motivo", d.reason],
    ["Caso", d.caseId ?? "Sin caso asociado"],
    ["Cliente", d.customerName ?? "—"],
    ["Teléfono", d.phone ?? "Sin teléfono (no tiene caso)"],
    ["Correo", d.fromEmail],
    ["Asunto", d.subject],
  ];
  const text = [`*** ${intro} ***`, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", "Mensaje:", d.excerpt, "", `Abrir en la bandeja: ${link}`, "", EMAIL.footer].join("\n");
  const html = wrapHtml(subject, [
    { type: "heading", text: "Llamar ahora" },
    { type: "alert", text: intro },
    { type: "kv", rows },
    { type: "box", title: "Mensaje", text: d.excerpt },
    { type: "button", label: "Abrir en la bandeja", href: link },
  ], { siteUrl: ctx.siteUrl, tone: "alert" });
  return { subject, text, html };
}
