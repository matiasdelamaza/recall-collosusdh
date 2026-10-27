/**
 * Validación y formato de RUT chileno (módulo 11).
 */

/** Deja solo dígitos y K, en mayúscula, sin puntos ni guion. */
export function cleanRut(input: string): string {
  return (input ?? "").toUpperCase().replace(/[^0-9K]/g, "");
}

export function computeRutDv(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return "0";
  if (rest === 10) return "K";
  return String(rest);
}

/** true si el RUT (con o sin formato) es válido. */
export function isValidRut(input: string): boolean {
  const clean = cleanRut(input);
  if (clean.length < 7 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  // Rechaza cuerpos triviales (p. ej. 1111111) que a veces pasan el módulo 11.
  if (/^(\d)\1+$/.test(body)) return false;
  return computeRutDv(body) === dv;
}

/** Normaliza a "12345678-9" (sin puntos, con guion, DV mayúscula). */
export function normalizeRut(input: string): string {
  const clean = cleanRut(input);
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

/** Formatea para mostrar: "12.345.678-9". */
export function formatRut(input: string): string {
  const clean = cleanRut(input);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}
