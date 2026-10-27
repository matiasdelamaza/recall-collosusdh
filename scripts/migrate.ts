/**
 * Aplica las migraciones de ./drizzle a la base de datos configurada.
 *   DATABASE_URL o POSTGRES_URL(_NON_POOLING) definida → PostgreSQL / Supabase
 *   sin URL                                            → PGlite local (./.data/pglite)
 *
 * Uso: npm run db:migrate
 *      tsx scripts/migrate.ts --if-configured   (en el build de Vercel: si no hay URL de PostgreSQL, no hace nada;
 *                                                con SKIP_DB_MIGRATIONS=true tampoco, para esquemas gestionados fuera)
 */
import fs from "node:fs";
import path from "node:path";
import * as schema from "../src/db/schema";
import { pgPoolConfig, resolveDatabaseUrl } from "../src/lib/db-url";

async function main() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const ifConfigured = process.argv.includes("--if-configured");
  if (ifConfigured && (process.env.SKIP_DB_MIGRATIONS ?? "").trim().toLowerCase() === "true") {
    console.log("SKIP_DB_MIGRATIONS=true: se omiten las migraciones en el build (el esquema se gestiona desde Supabase).");
    return;
  }
  const url = resolveDatabaseUrl({ forMigrations: true });
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool(pgPoolConfig(url, 1));
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    await pool.end();
    console.log("Migraciones aplicadas en PostgreSQL.");
    return;
  }
  if (ifConfigured) {
    console.log("Sin URL de PostgreSQL configurada: se omiten las migraciones (modo --if-configured).");
    return;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DATA_DIR?.trim() || path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  await client.close();
  console.log(`Migraciones aplicadas en PGlite (${dataDir}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
