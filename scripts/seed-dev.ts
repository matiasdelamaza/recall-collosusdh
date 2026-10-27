/**
 * Datos de DESARROLLO claramente ficticios. NUNCA ejecutar contra producción.
 *
 *   npm run db:seed:dev [-- --complete] [-- --force]
 *
 * Inserta las series DEMO-AFECTADA-0001 … DEMO-AFECTADA-0005 y deja la base en estado
 * PENDING (modo interino) salvo que se indique --complete.
 */
import { parseArgs } from "./_env";
import { getDb } from "../src/db/client";
import { affectedSerials } from "../src/db/schema";
import { setSerialDatabaseStatus } from "../src/lib/recall/verify";

const DEMO_SERIALS = Array.from({ length: 5 }, (_, i) => `DEMO-AFECTADA-${String(i + 1).padStart(4, "0")}`);

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const force = flags.force === true;
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (process.env.NODE_ENV === "production" && !force) {
    console.error("Rechazado: NODE_ENV=production. Este seed es solo para desarrollo.");
    process.exit(2);
  }
  if (url && !/localhost|127\.0\.0\.1/.test(url) && !force) {
    console.error("Rechazado: DATABASE_URL no apunta a localhost. Usa --force solo si sabes lo que haces.");
    process.exit(2);
  }

  const db = await getDb();
  await db
    .insert(affectedSerials)
    .values(
      DEMO_SERIALS.map((s) => ({
        serialNumber: s,
        serialRaw: s,
        model: "Collosus DH7 (DEMO)",
        size: "M",
        productionBatch: "DEMO-BATCH",
        status: "RECALL",
      })),
    )
    .onConflictDoNothing({ target: affectedSerials.serialNumber });

  if (flags.complete === true) await setSerialDatabaseStatus("COMPLETE", "seed-dev");
  else await setSerialDatabaseStatus("PENDING", "seed-dev");

  console.log("Datos de desarrollo cargados (FICTICIOS, no son series reales de Polygon):");
  for (const s of DEMO_SERIALS) console.log(`  ${s}  → resultado AFECTADA`);
  console.log("");
  console.log(`Estado de la base de series: ${flags.complete === true ? "COMPLETE" : "PENDING (modo interino)"}`);
  console.log("");
  console.log("Cómo probar:");
  console.log("  1. npm run dev");
  console.log("  2. Verifica DEMO-AFECTADA-0001 → 'TU BICICLETA ESTÁ INCLUIDA EN ESTE RECALL'");
  console.log(
    flags.complete === true
      ? "  3. Verifica OTRA-SERIE-123 → 'NO APARECE ACTUALMENTE…' (base marcada como completa)"
      : "  3. Verifica OTRA-SERIE-123 → 'PENDIENTE DE VERIFICACIÓN' (base en modo interino)",
  );
  console.log("  4. Serie 'AB' → 'NO PUDIMOS VERIFICAR TU NÚMERO DE SERIE'");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en seed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
