/**
 * Formato único de teléfono chileno (30-10-2026): "+56 9 1234 5678" para celulares y fijos de Santiago,
 * "+56 41 234 5678" para fijos de regiones. Un número que no se reconoce como chileno se guarda tal cual.
 */

/** Los 9 dígitos nacionales de un teléfono chileno, o null si no lo es. */
function chileanNational(input: string): string | null {
  const trimmed = (input ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("56")) return digits.slice(2);
  // "+" con otro código de país: no es chileno.
  if (trimmed.startsWith("+")) return null;
  if (digits.length === 9) return digits;
  return null;
}

export function normalizePhone(input: string): string {
  const national = chileanNational(input);
  if (!national) return (input ?? "").trim().replace(/\s+/g, " ");
  if (national.startsWith("9") || national.startsWith("2")) return `+56 ${national[0]} ${national.slice(1, 5)} ${national.slice(5)}`;
  return `+56 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}
