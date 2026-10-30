/**
 * Anonimización de textos antes de enviarlos a un modelo externo (OpenRouter).
 * Quita correos, RUT, teléfonos y los datos del caso (nombres, folio, serie).
 */

export interface RedactContext {
  names?: (string | null | undefined)[];
  caseId?: string | null;
  serial?: string | null;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const RUT = /(?<![\p{L}\p{N}])\d{1,2}\.?\d{3}\.?\d{3}-[\dkK](?![\p{L}\p{N}])/gu;
const PHONE = /(?<![\p{L}\p{N}])(?:\+56[ -]?)?\d(?:[ -]?\d){7,8}(?![\p{L}\p{N}])/gu;

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
  let out = text.replace(EMAIL, "[correo]");
  if (ctx.caseId?.trim()) out = replaceToken(out, ctx.caseId.trim(), "{caso}");
  if (ctx.serial?.trim()) out = replaceToken(out, ctx.serial.trim(), "{serie}");
  out = out.replace(RUT, "[rut]").replace(PHONE, "[teléfono]");
  const words = new Set(
    (ctx.names ?? [])
      .flatMap((n) => (n ? n.split(/\s+/) : []))
      .map((w) => w.trim())
      .filter((w) => [...w].length >= 3),
  );
  for (const w of words) out = replaceToken(out, w, "{nombre}");
  return out;
}
