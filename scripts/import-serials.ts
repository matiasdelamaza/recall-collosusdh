/**
 * Importa la base oficial de series afectadas desde un CSV de Polygon.
 *
 *   npm run serials:import -- <ruta.csv> [--dry-run] [--by=nombre] [--notes="texto"]
 *
 * Columnas: serial_number (obligatoria) | model | size | production_batch | status (RECALL|EXCLUDED)
 * Separador "," o ";" (autodetectado). Cabeceras insensibles a mayúsculas.
 *
 * Tras importar la base COMPLETA y validada, marca el estado en el panel (/admin/series)
 * o con: npm run cases:reprocess -- --notify
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./_env";
import { importSerialsFromCsv } from "../src/lib/recall/import";

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const file = positional[0];
  if (!file) {
    console.error("Uso: npm run serials:import -- <ruta.csv> [--dry-run] [--by=nombre] [--notes=texto]");
    process.exit(2);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`No se encontró el archivo: ${abs}`);
    process.exit(2);
  }
  const csv = fs.readFileSync(abs, "utf8");
  const dryRun = flags["dry-run"] === true;
  const by = typeof flags.by === "string" ? flags.by : "cli";
  const notes = typeof flags.notes === "string" ? flags.notes : undefined;

  console.log(`${dryRun ? "[SIMULACIÓN] " : ""}Importando ${path.basename(abs)} …`);
  const r = await importSerialsFromCsv(csv, { filename: path.basename(abs), importedBy: by, dryRun, notes });

  console.log("");
  console.log(`Resultado: ${r.ok ? "OK" : "CON ERRORES"}`);
  console.log(`  Filas leídas:        ${r.rowCount}`);
  console.log(`  Series insertadas:   ${r.insertedCount}${dryRun ? " (estimado)" : ""}`);
  console.log(`  Series actualizadas: ${r.updatedCount}${dryRun ? " (estimado)" : ""}`);
  console.log(`  Filas omitidas:      ${r.skippedCount}`);
  if (r.importId) console.log(`  ID de importación:   ${r.importId}`);
  if (r.errors.length > 0) {
    console.log("");
    console.log(`Errores (${r.errors.length}${r.errors.length >= 50 ? ", mostrando los primeros 50" : ""}):`);
    for (const e of r.errors) console.log(`  fila ${e.row}: ${e.message}`);
  }
  if (!dryRun && r.ok) {
    console.log("");
    console.log("Siguiente paso: cuando la base esté COMPLETA y validada, márcala como cargada en /admin/series");
    console.log("y reprocesa los casos pendientes: npm run cases:reprocess -- --notify");
  }
  process.exit(r.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Error al importar:", err instanceof Error ? err.message : err);
  process.exit(1);
});
