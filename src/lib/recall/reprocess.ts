/**
 * Reproceso de casos registrados en modo interino (PENDING_DATABASE) y casos en
 * revisión manual contra la base oficial una vez cargada.
 * CONTRATO: usado por `scripts/reprocess-pending.ts` y por el panel interno (/admin/series).
 * Implementación: agente backend.
 */
import "server-only";

export interface ReprocessOptions {
  actor: string;
  /** Enviar correo a los clientes con el resultado (afectada / no identificada). */
  notifyCustomers: boolean;
  dryRun?: boolean;
}

export interface ReprocessResult {
  scanned: number;
  nowAffected: number;
  nowNotIdentified: number;
  unchanged: number;
  notified: number;
  errors: { caseId: string; message: string }[];
}

export async function reprocessPendingCases(options: ReprocessOptions): Promise<ReprocessResult> {
  void options;
  throw new Error("reprocessPendingCases: pendiente de implementación (agente backend)");
}
