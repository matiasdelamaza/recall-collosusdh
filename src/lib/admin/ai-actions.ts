"use server";
/**
 * Server actions de la sección Entrenamiento de la IA.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteKnowledge, saveKnowledge, setExampleExcluded } from "@/lib/ai/knowledge";
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
