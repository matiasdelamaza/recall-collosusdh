/**
 * Anonimización de textos antes de enviarlos a un modelo externo (OpenRouter).
 * Quita correos, RUT, teléfonos y los datos del caso (nombres, folio, serie).
 */

export interface RedactContext {
  names?: (string | null | undefined)[];
  caseId?: string | null;
  serial?: string | null;
  /** Hilo o correo sin caso: no hay nombre conocido, así que se reemplaza el nombre del saludo inicial. */
  greeting?: boolean;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const RUT =
  /(?<![\p{L}\p{N}])(?:\d{1,2}\.\d{3}\.\d{3}(?:[ -]?[\dkK])?|\d{7,8}(?:-[\dkK]|[kK]))(?![\p{L}\p{N}])/gu;
const PHONE = /(?<![\p{L}\p{N}])(?:\+?56[ -]?)?\d(?:[ -]?\d){7,8}(?![\p{L}\p{N}])/gu;
/** Fechas (30-10-2026, 30/10/2026, 2026-10-30): se protegen para que no se tomen por teléfonos. */
const DATE = /(?<![\p{L}\p{N}])(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?![\p{L}\p{N}])/gu;
/**
 * Saludo inicial con nombre: "Hola Juan:", "Hola, Juan:", "Estimado, Juan", "Estimada/o Ana".
 * El nombre debe cerrar con ":", ",", "!" o fin de línea, para no tragarse una frase ("Hola, soy… y tengo una Collosus.").
 */
const GREETING = /^(\s*(?:Hola|Estimad[oa]s?(?:\/[ao])?)[, \t]+)[^:,\n.!?]{1,60}?(?=[ \t]*(?:[:,!]|\n|$))/i;

/** Reemplaza el nombre del saludo inicial por {nombre} (para textos sin caso, donde no se conoce el nombre). */
export function redactGreeting(text: string): string {
  return text.replace(GREETING, "$1{nombre}");
}

/** Aplica `fn` solo a los tramos que no son fechas. */
function outsideDates(text: string, fn: (s: string) => string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(DATE)) {
    out += fn(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(text.slice(last));
}

/** Minúsculas y sin tildes, carácter a carácter para conservar los índices. */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    out += base.length === 1 ? base : ch;
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Reemplaza `token` (comparado sin tildes ni mayúsculas, como palabra completa). */
function replaceToken(text: string, token: string, placeholder: string): string {
  const folded = fold(text);
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(fold(token))}(?![\\p{L}\\p{N}])`,
    "gu",
  );
  let out = "";
  let last = 0;
  for (const m of folded.matchAll(re)) {
    out += text.slice(last, m.index) + placeholder;
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

export function redactForAi(text: string, ctx: RedactContext = {}): string {
  let out = text.normalize("NFC");
  if (ctx.greeting) out = redactGreeting(out);
  out = out.replace(EMAIL, "[correo]");
  if (ctx.caseId?.trim()) out = replaceToken(out, ctx.caseId.trim(), "{caso}");
  if (ctx.serial?.trim()) out = replaceToken(out, ctx.serial.trim(), "{serie}");
  out = outsideDates(out, (s) => s.replace(RUT, "[rut]").replace(PHONE, "[teléfono]"));
  const words = new Set(
    (ctx.names ?? [])
      .flatMap((n) => (n ? n.split(/\s+/) : []))
      .map((w) => w.trim())
      .filter((w) => [...w].length >= 3),
  );
  for (const w of words) out = replaceToken(out, w, "{nombre}");
  return out;
}
