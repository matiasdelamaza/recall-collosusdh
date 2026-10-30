"use server";
/**
 * Server actions de la IA: sección Entrenamiento, resumen del caso y propuesta de respuesta.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftReply, getCaseSummary } from "@/lib/ai/assist";
import { deleteKnowledge, saveKnowledge, setExampleExcluded } from "@/lib/ai/knowledge";
import { ADMIN } from "@/lib/copy/es-admin";
import { logAudit } from "@/lib/server/audit";
import { requireAdmin } from "./session";

const PATH = "/admin/entrenamiento";

function str(formData: FormData, key: string, max: number): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.slice(0, max) : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de formulario: solo se acepta un uuid, cualquier otra cosa se trata como ausente. */
function idOf(formData: FormData): string {
  const v = str(formData, "id", 64);
  return UUID.test(v) ? v : "";
}

function done(msg: string): never {
  revalidatePath(PATH);
  redirect(`${PATH}?msg=${encodeURIComponent(msg)}`);
}

export async function saveKnowledgeAction(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const id = idOf(formData);
  if (formData.get("id") && !id) done("invalid");
  // Se deja pasar un poco más del máximo para que la validación avise en vez de recortar en silencio.
  const res = await saveKnowledge(
    { id: id || undefined, title: str(formData, "title", 1000), body: str(formData, "body", 20_000), active: formData.get("active") === "on" || formData.get("active") === "true" },
    actor,
  );
  done(res.ok ? "saved" : res.error);
}

export async function deleteKnowledgeAction(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const id = idOf(formData);
  if (id) await deleteKnowledge(id, actor);
  done(id ? "deleted" : "invalid");
}

export async function toggleExampleAction(formData: FormData): Promise<void> {
  const { actor } = await requireAdmin();
  const id = idOf(formData);
  const excluded = formData.get("excluded") === "true";
  if (!id) done("invalid");
  await setExampleExcluded(id, excluded, actor);
  done(excluded ? "excluded" : "included");
}

/** Vuelve a generar el resumen del caso aunque no haya correos nuevos. */
export async function refreshSummaryAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const messageId = str(formData, "messageId", 64);
  if (!UUID.test(messageId)) return;
  const summary = await getCaseSummary(messageId, { force: true });
  const path = `/admin/bandeja/${messageId}`;
  revalidatePath(path);
  // Si falla, la página lo avisa en la tarjeta en vez de seguir mostrando el resumen anterior en silencio.
  redirect(summary ? path : `${path}?ia=error`);
}

export type DraftActionState = { status: "idle" } | { status: "error"; message: string } | { status: "ok"; subject: string; body: string; at: number };

/** Propuesta de respuesta para el redactor. Se audita solo el largo: el texto no se guarda. */
export async function draftReplyAction(_prev: DraftActionState, formData: FormData): Promise<DraftActionState> {
  const { actor } = await requireAdmin();
  if (!process.env.OPENROUTER_API_KEY) return { status: "error", message: ADMIN.ai.draftNoKey };
  const messageId = str(formData, "draftMessageId", 64);
  const caseId = str(formData, "draftCaseId", 20);
  const input = UUID.test(messageId) ? { messageId } : caseId ? { caseId } : null;
  const draft = input ? await draftReply(input) : null;
  if (!draft) return { status: "error", message: ADMIN.ai.draftFailed };
  await logAudit({ type: "AI_DRAFT_GENERATED", actor, caseId: draft.caseUuid, payload: { length: draft.body.length } });
  return { status: "ok", subject: draft.subject, body: draft.body, at: Date.now() };
}
