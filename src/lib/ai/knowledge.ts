/**
 * Contexto que se entrega a la IA: contexto fijo (preguntas frecuentes y plantillas), fichas de
 * entrenamiento que agrega el equipo y respuestas manuales anteriores usadas como ejemplo.
 * Todo texto de ejemplo se anonimiza antes de salir de este módulo.
 */
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiKnowledge, emailMessages, recallCases, type AiKnowledgeRow } from "@/db/schema";
import { ADMIN } from "@/lib/copy/es-admin";
import { EMAIL, FAQ } from "@/lib/copy/es";
import { logAudit } from "@/lib/server/audit";
import { redactForAi } from "./redact";

export const KNOWLEDGE_TITLE_MAX = 120;
export const KNOWLEDGE_BODY_MAX = 6000;
/** Total de caracteres (título + texto) de las fichas activas. */
export const KNOWLEDGE_TOTAL_MAX = 40_000;
export const EXAMPLES_MAX = 20;

export type SaveKnowledgeResult = { ok: true } | { ok: false; error: "invalid" | "tooLong" };

function size(k: { title: string; body: string }): number {
  return k.title.length + k.body.length;
}

/** Fichas de entrenamiento, activas primero y luego por fecha de creación. */
export async function listKnowledge(): Promise<AiKnowledgeRow[]> {
  const db = await getDb();
  const rows = await db.select().from(aiKnowledge);
  return rows.sort((a, b) => Number(b.active) - Number(a.active) || a.createdAt.getTime() - b.createdAt.getTime());
}

/** Caracteres usados por las fichas activas. */
export function activeKnowledgeChars(rows: AiKnowledgeRow[]): number {
  return rows.filter((r) => r.active).reduce((n, r) => n + size(r), 0);
}

export async function saveKnowledge(input: { id?: string; title: string; body: string; active: boolean }, actor: string): Promise<SaveKnowledgeResult> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || title.length > KNOWLEDGE_TITLE_MAX || !body || body.length > KNOWLEDGE_BODY_MAX) return { ok: false, error: "invalid" };

  const db = await getDb();
  const all = await db.select().from(aiKnowledge);
  if (input.id && !all.some((r) => r.id === input.id)) return { ok: false, error: "invalid" };
  // El tope cuenta las fichas activas sin la que se está editando, más su nuevo tamaño si queda activa.
  const others = all.filter((r) => r.active && r.id !== input.id).reduce((n, r) => n + size(r), 0);
  if (input.active && others + size({ title, body }) > KNOWLEDGE_TOTAL_MAX) return { ok: false, error: "tooLong" };

  const now = new Date();
  let id = input.id;
  if (id) {
    await db.update(aiKnowledge).set({ title, body, active: input.active, updatedAt: now, updatedBy: actor }).where(eq(aiKnowledge.id, id));
  } else {
    const [row] = await db.insert(aiKnowledge).values({ title, body, active: input.active, updatedBy: actor }).returning();
    id = row!.id;
  }
  await logAudit({ type: "AI_KNOWLEDGE_CHANGED", actor, payload: { action: input.id ? "update" : "create", id } });
  return { ok: true };
}

export async function deleteKnowledge(id: string, actor: string): Promise<void> {
  const db = await getDb();
  await db.delete(aiKnowledge).where(eq(aiKnowledge.id, id));
  await logAudit({ type: "AI_KNOWLEDGE_CHANGED", actor, payload: { action: "delete", id } });
}

/** Quita el pie que `manualEmail` agrega (número de caso, serie, firma, sitio y aviso automático). */
function stripManualFooter(text: string): string {
  const signatureFirst = EMAIL.signature.split("\n")[0]!;
  const lines = text.split("\n");
  const cut = lines.findIndex((l) => l.startsWith(EMAIL.caseIdLabel) || l === signatureFirst);
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
}

export interface ExampleReply {
  id: string;
  subject: string;
  text: string;
  excluded: boolean;
  createdAt: Date;
}

/** Últimas respuestas manuales del equipo (anonimizadas y sin firma), más recientes primero. */
export async function listExampleReplies(opts: { includeExcluded?: boolean } = {}): Promise<ExampleReply[]> {
  const db = await getDb();
  const base = eq(emailMessages.kind, "MANUAL_EMAIL");
  const rows = await db
    .select({
      id: emailMessages.id,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
      excludedAt: emailMessages.aiExcludedAt,
      createdAt: emailMessages.createdAt,
      customerName: recallCases.customerName,
      caseId: recallCases.caseId,
      serial: recallCases.serialNumber,
    })
    .from(emailMessages)
    .leftJoin(recallCases, eq(emailMessages.caseId, recallCases.id))
    .where(opts.includeExcluded ? base : and(base, isNull(emailMessages.aiExcludedAt)))
    .orderBy(desc(emailMessages.createdAt))
    .limit(EXAMPLES_MAX);
  return rows.map((r) => {
    const ctx = { names: [r.customerName], caseId: r.caseId, serial: r.serial };
    return {
      id: r.id,
      subject: redactForAi(r.subject, ctx),
      text: redactForAi(stripManualFooter(r.bodyText), ctx),
      excluded: r.excludedAt !== null,
      createdAt: r.createdAt,
    };
  });
}

export async function setExampleExcluded(messageId: string, excluded: boolean, actor: string): Promise<void> {
  const db = await getDb();
  await db
    .update(emailMessages)
    .set({ aiExcludedAt: excluded ? new Date() : null })
    .where(and(eq(emailMessages.id, messageId), eq(emailMessages.kind, "MANUAL_EMAIL")));
  await logAudit({ type: "AI_KNOWLEDGE_CHANGED", actor, payload: { action: excluded ? "exclude" : "include", id: messageId } });
}

/** Contexto fijo en texto plano: preguntas frecuentes y plantillas de la bandeja. */
export function fixedContext(): string {
  const faq = FAQ.items.map((i) => `P: ${i.q}\nR: ${i.a.join(" ")}`).join("\n\n");
  const templates = ADMIN.templates.map((t) => `Plantilla "${t.label}"\nAsunto: ${t.subject}\n${t.body}`).join("\n\n");
  return `${FAQ.title}\n\n${faq}\n\nPLANTILLAS\n\n${templates}`;
}

export async function buildAiContext(): Promise<{ facts: string; examples: string }> {
  const [knowledge, examples] = await Promise.all([listKnowledge(), listExampleReplies()]);
  const cards = knowledge.filter((k) => k.active).map((k) => `## ${k.title}\n${k.body}`);
  const facts = [fixedContext(), ...(cards.length ? ["FICHAS DEL EQUIPO", ...cards] : [])].join("\n\n");
  const ex = examples.map((e, i) => `Ejemplo ${i + 1}\nAsunto: ${e.subject}\n${e.text}`).join("\n\n---\n\n");
  return { facts, examples: ex };
}
