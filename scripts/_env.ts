/**
 * Carga variables de `.env` (si existe) sin dependencias externas.
 * No sobreescribe variables ya definidas en el entorno.
 */
import fs from "node:fs";
import path from "node:path";

export function loadDotEnv(file = path.join(process.cwd(), ".env")): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let value = (m[2] ?? "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = value;
  }
}

loadDotEnv();

/** Argumentos simples: --flag, --clave=valor y posicionales. */
export function parseArgs(argv: string[]): { flags: Record<string, string | true>; positional: string[] } {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (const a of argv) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      flags[k!] = v === undefined ? true : v;
    } else positional.push(a);
  }
  return { flags, positional };
}
