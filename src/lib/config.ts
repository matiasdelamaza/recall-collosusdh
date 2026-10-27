/**
 * Configuración de entorno (server-side). Validada con zod; nunca importar desde componentes cliente.
 * Los valores NEXT_PUBLIC_* se leen directamente con process.env en el cliente.
 */
import { z } from "zod";
import { UPLOAD_MAX_TOTAL_BYTES } from "./limits";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),

  ADMIN_SESSION_SECRET: z.string().min(32).optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  IP_HASH_SALT: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["console", "resend", "smtp"]).default("console"),
  EMAIL_FROM: z.string().default("Polygon Collosus DH · Cross Mountain <no-reply@recallcollosusdh.cl>"),
  INTERNAL_NOTIFICATION_EMAILS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  /** Lo envía Vercel Cron como "Authorization: Bearer …" a /api/cron/*. */
  CRON_SECRET: z.string().min(16).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  STORAGE_PROVIDER: z.enum(["local", "s3", "supabase", "vercel-blob"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./.data/uploads"),
  // Supabase Storage vía API REST (variables inyectadas por la integración Supabase-Vercel).
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("recall-files"),
  // Vercel Blob (almacén privado enlazado al proyecto; el token lo inyecta Vercel).
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  VERCEL_BLOB_PREFIX: z.string().default("recall"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),

  TURNSTILE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),

  NEXT_PUBLIC_CONTACT_EMAIL: z.string().optional(),
  NEXT_PUBLIC_CONTACT_WHATSAPP: z.string().optional(),
  NEXT_PUBLIC_CONTACT_HOURS: z.string().optional(),

  ANALYTICS_PROVIDER: z.enum(["internal", "none"]).default("internal"),
  NEXT_PUBLIC_NOINDEX: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración de entorno inválida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Lista de correos internos de notificación (puede estar vacía si aún no se define). */
export function getInternalNotificationEmails(): string[] {
  return (getEnv().INTERNAL_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Límites de carga de archivos. */
export const UPLOAD_LIMITS = {
  // Vercel corta los cuerpos de más de 4,5 MB (ver src/lib/limits.ts); el navegador comprime las fotos antes de enviarlas.
  maxFileBytes: UPLOAD_MAX_TOTAL_BYTES,
  maxFilesPerCase: 10,
  maxTotalBytes: UPLOAD_MAX_TOTAL_BYTES,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const,
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"] as const,
} as const;

/** Límites de tasa (por IP hasheada). */
export const RATE_LIMITS = {
  serialLookup: { windowMs: 10 * 60 * 1000, max: 12 },
  /** A partir de este número de resultados no afectados en la ventana se exige Turnstile (si está configurado) o se bloquea. */
  serialLookupSuspiciousThreshold: 6,
  registration: { windowMs: 60 * 60 * 1000, max: 5 },
  /** Correo pedido antes de mostrar una serie afectada (/api/verificar/correo). */
  affectedContact: { windowMs: 10 * 60 * 1000, max: 10 },
  analytics: { windowMs: 60 * 1000, max: 60 },
  adminLogin: { windowMs: 15 * 60 * 1000, max: 8 },
  /** Prueba de correo de /api/health: límite global (no por IP), solo a los correos internos. */
  healthEmail: { windowMs: 60 * 60 * 1000, max: 3 },
} as const;

/** Máximo de casos activos por serie antes de rechazar nuevos registros (control de duplicados). */
export const MAX_ACTIVE_CASES_PER_SERIAL = 3;
