/**
 * Código del enlace personal de los correos de aviso (https://recallcollosusdh.cl/?r=C-7K2M9Q).
 * Sirve para saber qué destinatario abrió el enlace y si llegó a consultar su serie. La relación
 * código → persona vive solo en las listas locales (fuera del repositorio y de la BD).
 * Sin imports de servidor: lo usan el cliente y la API.
 */

export const OUTREACH_REF_PARAM = "r";
const STORAGE_KEY = "rcdh-ref";
const REF_RE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;

/** Código válido en mayúsculas, o null. */
export function normalizeOutreachRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return REF_RE.test(v) ? v : null;
}

/** Lee el código de la URL (y lo recuerda en la pestaña) o el guardado antes. Solo navegador. */
export function readOutreachRef(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = normalizeOutreachRef(new URLSearchParams(window.location.search).get(OUTREACH_REF_PARAM));
  try {
    if (fromUrl) window.sessionStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl ?? normalizeOutreachRef(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return fromUrl;
  }
}
