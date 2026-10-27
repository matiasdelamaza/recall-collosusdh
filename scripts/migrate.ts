/**
 * Aplica las migraciones de ./drizzle a la base de datos configurada.
 *   DATABASE_URL definida  → PostgreSQL / Supabase
 *   sin DATABASE_URL       → PGlite local (./.data/pglite)
 * Uso: npm run db:migrate
 */
import fs from "node:fs";
import path from "node:path";
import * as schema from "../src/db/schema";

async function main() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: 1 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    await pool.end();
    console.log("Migraciones aplicadas en PostgreSQL.");
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
