"use server";
/**
 * Server actions del panel interno. Todas exigen sesión válida y registran auditoría.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { caseNotes, recallCases, CASE_STATUSES, SERIAL_DATABASE_STATUSES, type CaseStatus, type SerialDatabaseStatus } from "@/db/schema";
import { isValidCaseId, normalizeCaseId } from "@/lib/case-id";
import { ADMIN } from "@/lib/copy/es-admin";
import { importSerialsFromCsv, type ImportSerialsResult } from "@/lib/recall/import";
import { reprocessPendingCases, type ReprocessResult } from "@/lib/recall/reprocess";
import { getSerialDatabaseStatus, setSerialDatabaseStatus } from "@/lib/recall/verify";
import { normalizeSerial } from "@/lib/serial";
import { logAudit } from "@/lib/server/audit";
import { requireAdmin } from "./session";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

function str(formData: FormData, key: string, max = 500): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isChecked(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

async function loadCase(caseIdInput: string) {
  const caseId = normalizeCaseId(caseIdInput);
  if (!isValidCaseId(caseId)) return null;
  const db = await getDb();
  const row = await db.query.recallCases.findFirst({ where: eq(recallCases.caseId, caseId) });
  return row ?? null;
}

function caseRedirect(caseId: string, msg: string): never {
  revalidatePath(`/admin/casos/${caseId}`);
  revalidatePath("/admin");
  redirect(`/admin/casos/${encodeURIComponent(caseId)}?msg=${encodeURIComponent(msg)}`);
}

// ── Casos ──────────────────────────────────────────────────────────────

export async function updateCaseStatus(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const caseId = normalizeCaseId(str(formData, "caseId", 20));
  const status = str(formData, "status", 40) as CaseStatus;
  const row = await loadCase(caseId);
  if (!row || !(CASE_STATUSES as readonly string[]).includes(status)) caseRedirect(caseId, "invalid");
  if (row.caseStatus === status) caseRedirect(caseId, "statusUpdated");
  const now = new Date();
  const closes = status === "CLOSED" || status === "REPLACED";
  const db = await getDb();
  await db
    .update(recallCases)
    .set({ caseStatus: status, updatedAt: now, closedAt: closes ? now : row.closedAt })
    .where(eq(recallCases.id, row.id));
  await logAudit({ type: "STATUS_CHANGED", actor, caseId: row.id, payload: { from: row.caseStatus, to: status } });
  caseRedirect(caseId, "statusUpdated");
}

export async function assignCase(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const caseId = normalizeCaseId(str(formData, "caseId", 20));
  const assignedTo = str(formData, "assignedTo", 80);
  const row = await loadCase(caseId);
  if (!row) caseRedirect(caseId, "invalid");
  const db = await getDb();
  await db
    .update(recallCases)
    .set({ assignedTo: assignedTo || null, updatedAt: new Date() })
    .where(eq(recallCases.id, row.id));
  await logAudit({ type: "CASE_ASSIGNED", actor, caseId: row.id, payload: { from: row.assignedTo, to: assignedTo || null } });
  caseRedirect(caseId, "assigned");
}

export async function addNote(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const caseId = normalizeCaseId(str(formData, "caseId", 20));
  const body = str(formData, "body", 4000);
  const author = str(formData, "author", 80) || actor;
  const row = await loadCase(caseId);
  if (!row || !body) caseRedirect(caseId, "invalid");
  const db = await getDb();
  await db.insert(caseNotes).values({ caseId: row.id, author, body });
  await db.update(recallCases).set({ updatedAt: new Date() }).where(eq(recallCases.id, row.id));
  await logAudit({ type: "NOTE_ADDED", actor: author, caseId: row.id, payload: { length: body.length } });
  caseRedirect(caseId, "noteAdded");
}

export async function setReplacementFrame(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const caseId = normalizeCaseId(str(formData, "caseId", 20));
  const serialInput = str(formData, "replacementFrameSerial", 64);
  const version = str(formData, "replacementFrameVersion", 120);
  const row = await loadCase(caseId);
  if (!row) caseRedirect(caseId, "invalid");
  const serial = serialInput ? normalizeSerial(serialInput) : "";
  const db = await getDb();
  await db
    .update(recallCases)
    .set({ replacementFrameSerial: serial || null, replacementFrameVersion: version || null, updatedAt: new Date() })
    .where(eq(recallCases.id, row.id));
  await logAudit({
    type: "REPLACEMENT_FRAME_SET",
    actor,
    caseId: row.id,
    payload: { replacementFrameSerial: serial || null, replacementFrameVersion: version || null },
  });
  caseRedirect(caseId, "replacementSaved");
}

// ── Base de series ─────────────────────────────────────────────────────

export async function setSerialDatabaseStatusAction(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const status = str(formData, "status", 20) as SerialDatabaseStatus;
  if (!(SERIAL_DATABASE_STATUSES as readonly string[]).includes(status)) {
    redirect("/admin/series?msg=error");
  }
  const previous = await getSerialDatabaseStatus();
  await setSerialDatabaseStatus(status, actor);
  await logAudit({ type: "SERIAL_DATABASE_STATUS_CHANGED", actor, payload: { from: previous, to: status } });
  revalidatePath("/admin/series");
  revalidatePath("/");
  redirect("/admin/series?msg=statusChanged");
}

export type ImportActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; dryRun: boolean; filename: string; result: ImportSerialsResult };

export async function importSerialsAction(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const { actor } = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: file instanceof File && file.size === 0 ? ADMIN.serials.messages.fileEmpty : ADMIN.serials.messages.fileRequired };
  }
  if (file.size > MAX_CSV_BYTES) return { status: "error", message: ADMIN.serials.messages.fileTooLarge };
  const dryRun = isChecked(formData, "dryRun");
  const notes = str(formData, "notes", 500) || undefined;
  const filename = (file.name || "import.csv").replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  let csvText: string;
  try {
    csvText = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { status: "error", message: ADMIN.serials.messages.error };
  }
  try {
    const result = await importSerialsFromCsv(csvText, { filename, importedBy: actor, dryRun, notes });
    if (!dryRun) {
      revalidatePath("/admin/series");
      revalidatePath("/admin/metricas");
    }
    return { status: "done", dryRun, filename, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin] importación de series falló:", message);
    return { status: "error", message: message.includes("pendiente de implementación") ? ADMIN.serials.messages.notImplemented : ADMIN.serials.messages.error };
  }
}

export type ReprocessActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; dryRun: boolean; notify: boolean; result: ReprocessResult };

export async function reprocessAction(_prev: ReprocessActionState, formData: FormData): Promise<ReprocessActionState> {
  const { actor } = await requireAdmin();
  const notifyCustomers = isChecked(formData, "notify");
  const dryRun = isChecked(formData, "dryRun");
  try {
    const result = await reprocessPendingCases({ actor, notifyCustomers, dryRun });
    if (!dryRun) {
      revalidatePath("/admin");
      revalidatePath("/admin/series");
      revalidatePath("/admin/metricas");
    }
    return { status: "done", dryRun, notify: notifyCustomers, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin] reproceso falló:", message);
    return { status: "error", message: message.includes("pendiente de implementación") ? ADMIN.serials.messages.notImplemented : ADMIN.serials.messages.error };
  }
}
