import "server-only";
import { getEnv } from "@/lib/config";
import { createLocalStorage } from "./local";
import { createS3Storage } from "./s3";
import { createSupabaseStorage } from "./supabase";
import type { StorageProvider } from "./types";

export type { StorageProvider, StoredObject } from "./types";

type GlobalWithStorage = typeof globalThis & { __recallStorage?: StorageProvider };
const g = globalThis as GlobalWithStorage;

/** Proveedor de almacenamiento según STORAGE_PROVIDER (singleton). */
export function getStorage(): StorageProvider {
  if (g.__recallStorage) return g.__recallStorage;
  const env = getEnv();
  if (env.STORAGE_PROVIDER === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("STORAGE_PROVIDER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
    }
    g.__recallStorage = createSupabaseStorage({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      bucket: env.SUPABASE_STORAGE_BUCKET,
    });
  } else if (env.STORAGE_PROVIDER === "s3") {
    if (!env.S3_BUCKET) throw new Error("STORAGE_PROVIDER=s3 requiere S3_BUCKET");
    g.__recallStorage = createS3Storage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  } else {
    g.__recallStorage = createLocalStorage(env.LOCAL_STORAGE_DIR);
  }
  return g.__recallStorage;
}

/** Reinicia el singleton (pruebas). */
export function resetStorage(): void {
  g.__recallStorage = undefined;
}
