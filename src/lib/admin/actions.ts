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
import { SERIALS_CSV_MAX_BYTES } from "@/lib/limits";
import { getInternalNotificationEmails } from "@/lib/config";
import { notifyStageChange, sendBroadcast, sendBroadcastTest } from "@/lib/recall/follow-up";
import { sendFromInbox } from "@/lib/recall/inbox";
import { getMessage, linkSenderToCase, markCaseCalled, markInboundHandled } from "@/lib/recall/mailbox";
import { importOutreach, OutreachCsvError, rebuildCaseEmails } from "@/lib/recall/email-backfill";
import { importSerialsFromCsv, type ImportSerialsResult } from "@/lib/recall/import";
import { reprocessPendingCases, type ReprocessResult } from "@/lib/recall/reprocess";
import { countRecallSerials, getSerialDatabaseStatus, setSerialDatabaseStatus } from "@/lib/recall/verify";
import { normalizeSerial } from "@/lib/serial";
import { logAudit } from "@/lib/server/audit";
import { requireAdmin } from "./session";

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
  const [updated] = await db
    .update(recallCases)
    .set({ caseStatus: status, updatedAt: now, closedAt: closes ? now : row.closedAt })
    .where(eq(recallCases.id, row.id))
    .returning();
  await logAudit({ type: "STATUS_CHANGED", actor, caseId: row.id, payload: { from: row.caseStatus, to: status } });
  // Aviso al cliente de la nueva etapa (solo unidades afectadas y etapas del reemplazo).
  const notified = isChecked(formData, "notifyCustomer") && updated ? await notifyStageChange(updated) : false;
  caseRedirect(caseId, notified ? "statusUpdatedNotified" : "statusUpdated");
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
  // Con la base vacía, COMPLETE haría que toda serie (incluidas las afectadas) reciba "no aparece actualmente".
  if (status === "COMPLETE" && (await countRecallSerials()) === 0) {
    redirect("/admin/series?msg=completeWithoutSerials");
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
  if (file.size > SERIALS_CSV_MAX_BYTES) return { status: "error", message: ADMIN.serials.messages.fileTooLarge };
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

// ── Comunicaciones ─────────────────────────────────────────────────────

export type BroadcastActionState = { status: "idle" } | { status: "error"; message: string } | { status: "tested"; message: string } | { status: "sent"; message: string };

export async function broadcastAction(_prev: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  const { actor } = await requireAdmin();
  const C = ADMIN.comms;
  const subject = str(formData, "subject", 200);
  const body = str(formData, "body", 5000);
  if (subject.length < 5 || subject.length > 120) return { status: "error", message: C.invalidSubject };
  if (body.length < 20 || body.length > 4000) return { status: "error", message: C.invalidBody };
  const message = { subject, body };

  if (str(formData, "intent", 10) === "test") {
    const to = getInternalNotificationEmails();
    if (to.length === 0) return { status: "error", message: C.noInternal };
    const ok = await sendBroadcastTest(message, to);
    return ok ? { status: "tested", message: C.testSent(to.join(", ")) } : { status: "error", message: C.testFailed };
  }

  if (!isChecked(formData, "confirmed")) return { status: "error", message: C.needConfirm };
  const result = await sendBroadcast(message, { includeContacts: isChecked(formData, "includeContacts"), actor });
  revalidatePath("/admin/comunicaciones");
  return { status: "sent", message: C.sent(result.sent, result.failed) };
}

// ── Mesa de control / bandeja ──────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function backTo(formData: FormData, fallback: string): string {
  const v = str(formData, "back", 200);
  return v.startsWith("/admin") ? v : fallback;
}

function withMsg(path: string, msg: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`;
}

/** Marcas que la IA deja para completar a mano: [completar: …], [correo], [teléfono] y [rut]. */
const PLACEHOLDER_RE = /\[\s*(?:completar|correo\s*\]|tel[eé]fono\s*\]|rut\s*\])/i;

function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text.normalize("NFC"));
}

export type SendEmailActionState = { status: "idle" } | { status: "error"; message: string } | { status: "sent"; message: string; at: number };

/** Envía un correo desde la bandeja (respuesta o mensaje nuevo) al cliente de un caso o a un remitente sin caso. */
export async function sendEmailAction(_prev: SendEmailActionState, formData: FormData): Promise<SendEmailActionState> {
  const { actor } = await requireAdmin();
  const I = ADMIN.inbox;
  const subject = str(formData, "subject", 300);
  const body = str(formData, "body", 7000);
  if (subject.length < 3 || subject.length > 150) return { status: "error", message: I.invalidSubject };
  if (body.length < 10 || body.length > 6000) return { status: "error", message: I.invalidBody };
  // Una propuesta de la IA con partes por completar o marcas de anonimización no puede salir tal cual.
  if (hasPlaceholder(subject) || hasPlaceholder(body)) return { status: "error", message: ADMIN.ai.draftIncomplete };
  const caseIdInput = str(formData, "caseId", 20);
  const c = caseIdInput ? await loadCase(caseIdInput) : null;
  if (caseIdInput && !c) return { status: "error", message: ADMIN.caseDetail.messages.invalid };
  // Con caso, siempre al correo registrado; sin caso, al remitente del hilo.
  const to = c ? c.email : str(formData, "to", 200).toLowerCase();
  if (!EMAIL_RE.test(to)) return { status: "error", message: I.invalidTo };
  const ok = await sendFromInbox({ case: c, to, subject, body, actor });
  if (!ok) return { status: "error", message: I.sendFailed };
  revalidatePath("/admin/mesa");
  revalidatePath("/admin/bandeja", "layout");
  if (c) revalidatePath(`/admin/casos/${c.caseId}`);
  return { status: "sent", message: I.sent, at: Date.now() };
}

export async function markCalledAction(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const row = await loadCase(str(formData, "caseId", 20));
  const back = backTo(formData, "/admin/mesa");
  if (!row) redirect(withMsg(back, "invalid"));
  await markCaseCalled(row, actor, str(formData, "note", 500));
  revalidatePath("/admin/mesa");
  revalidatePath(`/admin/casos/${row.caseId}`);
  redirect(withMsg(back, "called"));
}

export async function markHandledAction(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const messageId = str(formData, "messageId", 40);
  const message = await getMessage(messageId);
  const back = backTo(formData, `/admin/bandeja/${messageId}`);
  if (!message) redirect(withMsg(back, "invalid"));
  const n = message.caseId ? await markInboundHandled({ caseUuid: message.caseId }, actor) : await markInboundHandled({ fromEmail: message.fromEmail }, actor);
  await logAudit({ type: "MESSAGE_HANDLED", actor, caseId: message.caseId, payload: { messageId, handled: n } });
  revalidatePath("/admin/mesa");
  revalidatePath("/admin/bandeja", "layout");
  redirect(withMsg(back, "handled"));
}

export async function linkMessageAction(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const messageId = str(formData, "messageId", 40);
  const row = await loadCase(str(formData, "caseId", 20));
  if (!row) redirect(withMsg(`/admin/bandeja/${messageId}`, "linkNotFound"));
  await linkSenderToCase(messageId, row, actor);
  revalidatePath("/admin/mesa");
  revalidatePath("/admin/bandeja", "layout");
  redirect(withMsg(`/admin/bandeja/${messageId}`, "linked"));
}

// ── Correos anteriores en la bitácora ──────────────────────────────────

export type RebuildActionState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

const OUTREACH_CSV_MAX_BYTES = 1_000_000;

export async function rebuildCaseEmailsAction(_prev: RebuildActionState): Promise<RebuildActionState> {
  const { actor } = await requireAdmin();
  const R = ADMIN.comms.rebuild;
  try {
    const r = await rebuildCaseEmails(actor);
    revalidatePath("/admin/bandeja");
    revalidatePath("/admin/mesa");
    return { status: "done", message: R.systemDone(r.inserted, r.existing) };
  } catch (err) {
    console.error("[admin] reconstrucción de la bitácora falló:", err instanceof Error ? err.message : err);
    return { status: "error", message: R.error };
  }
}

export async function importOutreachAction(_prev: RebuildActionState, formData: FormData): Promise<RebuildActionState> {
  const { actor } = await requireAdmin();
  const R = ADMIN.comms.rebuild;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: R.fileRequired };
  if (file.size > OUTREACH_CSV_MAX_BYTES) return { status: "error", message: R.fileTooLarge };
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(await file.arrayBuffer()));
    const r = await importOutreach(text, actor);
    revalidatePath("/admin/bandeja");
    revalidatePath("/admin/mesa");
    return { status: "done", message: R.outreachDone(r) };
  } catch (err) {
    if (err instanceof OutreachCsvError) return { status: "error", message: R.badColumns };
    console.error("[admin] importación del aviso falló:", err instanceof Error ? err.message : err);
    return { status: "error", message: R.error };
  }
}
