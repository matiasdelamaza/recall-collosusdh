/**
 * Interfaz de almacenamiento de archivos subidos.
 * Las claves (`key`) son privadas: nunca se construyen URLs públicas a partir de ellas.
 * El panel interno sirve los archivos a través de una ruta autenticada.
 */
export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  readonly name: "local" | "s3" | "supabase" | "vercel-blob";
  /** Guarda bytes bajo la clave indicada (la clave la genera el servidor, no el cliente). */
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;
  /** Devuelve el contenido o null si no existe. */
  get(key: string): Promise<{ data: Uint8Array; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
