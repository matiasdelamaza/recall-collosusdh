/**
 * Resolución de la cadena de conexión a PostgreSQL y de su configuración TLS.
 * Sin `server-only` para poder usarse también desde los scripts CLI.
 *
 * Orden de prioridad:
 *   1. DATABASE_URL (configuración manual).
 *   2. Variables que inyecta la integración de Supabase (o Neon) en Vercel:
 *      POSTGRES_URL (pooler, para la aplicación) y POSTGRES_URL_NON_POOLING (conexión directa, para migraciones).
 */

export interface PgSslOption {
  rejectUnauthorized: boolean;
  ca?: string;
}

function clean(v: string | undefined): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

/** URL de conexión para la aplicación (pooler si existe) o para migraciones (conexión directa si existe). */
export function resolveDatabaseUrl(opts: { forMigrations?: boolean } = {}): string | undefined {
  const manual = clean(process.env.DATABASE_URL);
  if (manual) return manual;
  if (opts.forMigrations) {
    return clean(process.env.POSTGRES_URL_NON_POOLING) ?? clean(process.env.POSTGRES_URL);
  }
  return clean(process.env.POSTGRES_URL);
}

/** true si el host corresponde a Supabase (su CA no está en el almacén de confianza de Node). */
export function isSupabaseHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".supabase.co") || host.endsWith(".supabase.com");
  } catch {
    return false;
  }
}

let warnedSupabaseSsl = false;

/**
 * Configuración TLS para `pg`:
 *   - DATABASE_SSL=no-verify → TLS sin verificar certificado (opción explícita).
 *   - DATABASE_SSL=true o `sslmode=require|verify-*` en la URL → TLS verificando; usa DATABASE_SSL_CA si se entrega.
 *   - Host de Supabase sin DATABASE_SSL_CA → TLS sin verificar certificado (lo que recomienda la propia
 *     documentación de Supabase para node-postgres), con aviso en consola. Para verificar, entregar la CA
 *     de Supabase en DATABASE_SSL_CA.
 *   - En otro caso → sin TLS (p. ej. localhost).
 */
export function resolveDatabaseSsl(url: string): PgSslOption | undefined {
  const mode = (process.env.DATABASE_SSL ?? "").trim().toLowerCase();
  const ca = clean(process.env.DATABASE_SSL_CA);
  if (mode === "no-verify") return { rejectUnauthorized: false };
  const wantsSsl = mode !== "" && mode !== "false" && mode !== "disable";
  const urlWantsSsl = /sslmode=(require|verify-ca|verify-full)/i.test(url);
  const supabase = isSupabaseHost(url);
  if (!wantsSsl && !urlWantsSsl && !supabase) return undefined;
  if (ca) return { rejectUnauthorized: true, ca };
  if (supabase) {
    if (!warnedSupabaseSsl) {
      warnedSupabaseSsl = true;
      console.warn("[db] Supabase sin DATABASE_SSL_CA: TLS activo sin verificación de certificado. Para verificar, define DATABASE_SSL_CA.");
    }
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}
