import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Prueba de integración ligera del script de auditoría de idioma (scripts/audit-copy.ts):
 * se ejecuta sobre una carpeta temporal con casos conocidos.
 */
const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts", "audit-copy.ts");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");

let dir: string;

function runAudit(target: string): { code: number; output: string } {
  try {
    const output = execFileSync(TSX, [SCRIPT], {
      cwd: ROOT,
      env: { ...process.env, AUDIT_COPY_DIR: target },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-copy-"));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("scripts/audit-copy.ts", () => {
  it("pasa cuando todo el texto visible está en español", () => {
    const clean = path.join(dir, "limpio");
    fs.mkdirSync(path.join(clean, "lib", "copy"), { recursive: true });
    fs.mkdirSync(path.join(clean, "components"), { recursive: true });
    fs.writeFileSync(
      path.join(clean, "lib", "copy", "es.ts"),
      [
        '// "Affected" en un comentario no cuenta',
        "export const T = {",
        '  a: "Unidad afectada",',
        '  b: "No utilices la bicicleta",',
        '  key: "MANUAL_REVIEW",',
        '  url: "https://example.com/register",',
        "};",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(clean, "components", "Ok.tsx"),
      [
        "export function Ok({ state }: { state: string }) {",
        '  const affected = state === "AFFECTED"; // Affected: comentario',
        "  return (",
        '    <form className="loading">',
        "      {/* Manual Review: comentario JSX */}",
        "      <h1>Recall de Seguridad</h1>",
        '      <input type="submit" name="register" />',
        "      <p>{affected ? 'Unidad afectada' : 'Revisión manual'}</p>",
        "    </form>",
        "  );",
        "}",
      ].join("\n"),
    );
    const r = runAudit(clean);
    expect(r.output).toContain("OK: no se encontraron textos en inglés prohibidos");
    expect(r.code).toBe(0);
  });

  it("detecta términos prohibidos en texto JSX, atributos visibles y archivos de copy", () => {
    const bad = path.join(dir, "malo");
    fs.mkdirSync(path.join(bad, "lib", "copy"), { recursive: true });
    fs.mkdirSync(path.join(bad, "lib", "email"), { recursive: true });
    fs.mkdirSync(path.join(bad, "components"), { recursive: true });
    fs.writeFileSync(
      path.join(bad, "components", "Bad.tsx"),
      [
        "export function Bad() {",
        "  return (",
        '    <div title="Verify your bike">',
        "      <h1>Stop Riding</h1>",
        '      <input placeholder="Not sure" />',
        "      <button>Register</button>",
        "      <span>Submit</span> {/* audit-copy: ignore */}",
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(bad, "lib", "copy", "es.ts"),
      ['export const X = { a: "Your bike is safe", b: "Don\'t panic", c: "100% safe", d: "AFFECTED" };'].join("\n"),
    );
    fs.writeFileSync(path.join(bad, "lib", "email", "templates.ts"), 'export const s = "Safety Recall notice";\n');

    const r = runAudit(bad);
    expect(r.code).toBe(1);
    for (const term of ["[Verify]", "[Stop Riding]", "[Not sure]", "[Register]", "[your bike is safe]", "[Don't panic]", "[100% safe]", "[Safety Recall]"]) {
      expect(r.output).toContain(term);
    }
    // Exclusión explícita y clave técnica
    expect(r.output).not.toContain("[Submit]");
    expect(r.output).not.toContain("[Affected]");
    expect(r.output).toContain("Bad.tsx:4");
  });
});
