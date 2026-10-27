/**
 * Auditoría de idioma — Recall Polygon Collosus DH (Chile).
 *
 * Busca términos en inglés PROHIBIDOS en la interfaz pública (brief §0 y §33) dentro de:
 *   - texto JSX (entre `>` y `<`) y atributos placeholder/title/aria-label/alt de src/**\/*.tsx
 *   - todos los literales de texto de src/lib/copy/*.ts y src/lib/email/templates.ts
 *
 * Ignora comentarios, identificadores, imports, rutas y claves técnicas (MAYÚSCULAS_CON_GUION_BAJO).
 * Para una exclusión justificada agrega `// audit-copy: ignore` en la misma línea.
 *
 * Uso: npm run audit:copy   (sale con código 1 si hay hallazgos)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
/** Directorio a auditar (por defecto ./src). AUDIT_COPY_DIR permite auditar otra carpeta, p. ej. en pruebas. */
const SRC = process.env.AUDIT_COPY_DIR ? path.resolve(process.env.AUDIT_COPY_DIR) : path.join(ROOT, "src");

/** Términos prohibidos en texto visible al usuario (coincidencia de palabra completa, sin distinguir mayúsculas). */
const FORBIDDEN_TERMS = [
  "Safety Recall",
  "Stop Riding",
  "Affected",
  "Manual Review",
  "Replacement Frame",
  "your bike is safe",
  "100% safe",
  "no risk",
  "defective",
  "Polycrack",
  "weld defect",
  "reinforced frame",
  "manufacturing negligence",
  "admitted fault",
  "Don't panic",
  "Submit",
  "Loading",
  "Verify",
  "Register",
  "Not sure",
];

const IGNORE_MARKER = /audit-copy:\s*ignore/i;

interface Finding {
  file: string;
  line: number;
  term: string;
  excerpt: string;
}

// ── Utilidades ─────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Reemplaza comentarios por espacios conservando saltos de línea (los offsets y líneas se mantienen). */
function blankComments(source: string): string {
  // Comentarios de bloque
  let out = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  // Comentarios de línea: `//` precedido por inicio de línea o espacio, y con número par de comillas antes
  // (evita tratar "https://..." dentro de un literal como comentario).
  out = out
    .split("\n")
    .map((line) => {
      let idx = -1;
      let from = 0;
      while ((idx = line.indexOf("//", from)) !== -1) {
        const before = line.slice(0, idx);
        const prev = idx === 0 ? " " : line[idx - 1]!;
        const quotesBalanced = ["\"", "'", "`"].every((q) => (before.split(q).length - 1) % 2 === 0);
        if ((prev === " " || prev === "\t" || idx === 0) && quotesBalanced) {
          return before + " ".repeat(line.length - idx);
        }
        from = idx + 2;
      }
      return line;
    })
    .join("\n");
  return out;
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
}

/** Un segmento de texto candidato con su offset en el archivo. */
interface Segment {
  text: string;
  offset: number;
}

const TECH_KEY = /^[A-Z0-9_\-:./]+$/;
const PATH_LIKE = /^(@\/|\.\/|\.\.\/|\/|https?:\/\/|mailto:|tel:|#)/;

function isIgnorableSegment(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (TECH_KEY.test(t)) return true; // AFFECTED, MANUAL_REVIEW, RCDH-XXXXX, etc.
  if (PATH_LIKE.test(t)) return true;
  if (/^[\w./-]+\.(tsx?|css|svg|png|jpe?g|webp|json|csv)$/i.test(t)) return true; // nombres de archivo
  return false;
}

/** Literales de texto: "...", '...', `...` (incluye multilínea en backticks). */
function stringLiterals(source: string): Segment[] {
  const segments: Segment[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const text = m[1] ?? m[2] ?? m[3] ?? "";
    segments.push({ text, offset: m.index + 1 });
  }
  return segments;
}

/** Texto JSX entre `>` y `<` sin llaves (excluye expresiones entre llaves y comentarios JSX). */
function jsxText(source: string): Segment[] {
  const segments: Segment[] = [];
  const re = />([^<>{}]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const text = m[1]!;
    // Descarta fragmentos que claramente son código (operadores de comparación/flechas, p. ej. `a > b && c <`)
    if (/[;=()]|=>|&&|\|\|/.test(text)) continue;
    segments.push({ text, offset: m.index + 1 });
    re.lastIndex = m.index + m[0].length - 1; // permite solapar `<` de cierre con el siguiente `>`
  }
  return segments;
}

/** Atributos JSX visibles al usuario con valor literal. */
function jsxAttributes(source: string): Segment[] {
  const segments: Segment[] = [];
  const re = /\b(placeholder|title|aria-label|alt)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`]*)`\s*\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const text = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? "";
    segments.push({ text, offset: m.index });
  }
  return segments;
}

function termRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Límite de palabra manual para que funcione con términos que empiezan/terminan en no-alfanumérico ("100% safe", "Don't panic").
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, "i");
}

const TERM_REGEXES = FORBIDDEN_TERMS.map((term) => ({ term, re: termRegex(term) }));

function scanSegments(file: string, source: string, rawSource: string, segments: Segment[], findings: Finding[]): void {
  // El marcador de exclusión se busca en el texto ORIGINAL (los comentarios ya fueron borrados en `source`).
  const lines = rawSource.split("\n");
  for (const seg of segments) {
    if (isIgnorableSegment(seg.text)) continue;
    for (const { term, re } of TERM_REGEXES) {
      const match = re.exec(seg.text);
      if (!match) continue;
      const localOffset = match.index + (match[1] ? match[1].length : 0);
      const line = lineOf(source, seg.offset + localOffset);
      const lineText = lines[line - 1] ?? "";
      if (IGNORE_MARKER.test(lineText)) continue;
      findings.push({
        file: path.relative(ROOT, file),
        line,
        term,
        excerpt: seg.text.trim().replace(/\s+/g, " ").slice(0, 100),
      });
    }
  }
}

// ── Ejecución ──────────────────────────────────────────────────────────

function main(): void {
  const files = walk(SRC);
  const findings: Finding[] = [];
  let scanned = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const raw = fs.readFileSync(file, "utf8");
    const source = blankComments(raw);
    scanned++;

    const isCopyFile = /(^|\/)lib\/copy\/[^/]+\.ts$/.test(rel) || /(^|\/)lib\/email\/templates\.ts$/.test(rel);
    const isTsx = rel.endsWith(".tsx");

    if (isCopyFile) {
      scanSegments(file, source, raw, stringLiterals(source), findings);
    }
    if (isTsx) {
      scanSegments(file, source, raw, jsxText(source), findings);
      scanSegments(file, source, raw, jsxAttributes(source), findings);
    }
  }

  // Deduplicar (misma línea y término)
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const k = `${f.file}:${f.line}:${f.term.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (unique.length === 0) {
    console.log(`OK: no se encontraron textos en inglés prohibidos (${scanned} archivos revisados).`);
    process.exit(0);
  }

  console.error(`Se encontraron ${unique.length} texto(s) en inglés prohibido(s) en la interfaz (${scanned} archivos revisados):\n`);
  for (const f of unique.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.error(`  ${f.file}:${f.line}  [${f.term}]  "${f.excerpt}"`);
  }
  console.error("\nReemplaza por el equivalente en español (ver src/lib/copy/es.ts) o agrega `// audit-copy: ignore` si la exclusión está justificada.");
  process.exit(1);
}

main();
