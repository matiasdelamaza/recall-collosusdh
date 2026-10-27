/**
 * Reprocesa los casos pendientes / no identificados contra la base oficial de series.
 *
 *   npm run cases:reprocess [-- --notify] [-- --dry-run] [-- --by=nombre]
 *
 * --notify   envía correo a los clientes con el resultado (afectada / no identificada)
 * --dry-run  solo informa qué cambiaría
 */
import { parseArgs } from "./_env";
import { reprocessPendingCases } from "../src/lib/recall/reprocess";
import { getSerialDatabaseStatus } from "../src/lib/recall/verify";

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const dryRun = flags["dry-run"] === true;
  const notify = flags.notify === true;
  const actor = typeof flags.by === "string" ? flags.by : "cli";

  const status = await getSerialDatabaseStatus();
  console.log(`Estado de la base de series: ${status === "COMPLETE" ? "COMPLETE (cargada y validada)" : "PENDING (modo interino)"}`);
  if (status !== "COMPLETE") {
    console.log("Aviso: mientras la base esté PENDING solo se promueven coincidencias positivas; nadie pasa a 'no identificada'.");
  }
  console.log(`${dryRun ? "[SIMULACIÓN] " : ""}Reprocesando casos${notify ? " con notificación a clientes" : ""} …`);

  const r = await reprocessPendingCases({ actor, notifyCustomers: notify, dryRun });
  console.log("");
  console.log(`  Casos revisados:            ${r.scanned}`);
  console.log(`  Ahora AFECTADA:             ${r.nowAffected}`);
  console.log(`  Ahora NO AFECTADAS (OK):    ${r.nowReinforced}`);
  console.log(`  Ahora NO IDENTIFICADA:      ${r.nowNotIdentified}`);
  console.log(`  Sin cambios:                ${r.unchanged}`);
  console.log(`  Clientes notificados:       ${r.notified}`);
  if (r.errors.length > 0) {
    console.log(`  Errores (${r.errors.length}):`);
    for (const e of r.errors) console.log(`    ${e.caseId}: ${e.message}`);
  }
  process.exit(r.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Error al reprocesar:", err instanceof Error ? err.message : err);
  process.exit(1);
});
