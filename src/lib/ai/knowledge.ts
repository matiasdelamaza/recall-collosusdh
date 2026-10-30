/**
 * Contexto que se entrega a la IA: contexto fijo (preguntas frecuentes y plantillas), fichas de
 * entrenamiento que agrega el equipo y respuestas manuales anteriores usadas como ejemplo.
 * Todo texto de ejemplo se anonimiza antes de salir de este módulo.
 */
import "server-only";
import { and, desc, eq, isNotNull, isNull, notInArray } from "drizzle-orm";
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
  const title = input.title.replace(/\r\n/g, "\n").trim();
  const body = input.body.replace(/\r\n/g, "\n").trim();
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

/** Máximo de caracteres de cada ejemplo. */
export const EXAMPLE_TEXT_MAX = 3000;
/** Estados de envío que no cuentan como respuesta real al cliente. */
const NOT_SENT = ["FAILED", "BOUNCED", "COMPLAINED"] as const;

type ExampleFilter = "used" | "excluded" | "all";

async function queryExamples(filter: ExampleFilter): Promise<ExampleReply[]> {
  const db = await getDb();
  const conds = [eq(emailMessages.kind, "MANUAL_EMAIL"), eq(emailMessages.direction, "OUT"), notInArray(emailMessages.status, [...NOT_SENT])];
  if (filter === "used") conds.push(isNull(emailMessages.aiExcludedAt));
  if (filter === "excluded") conds.push(isNotNull(emailMessages.aiExcludedAt));
  const rows = await db
    .select({
      id: emailMessages.id,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
      toEmails: emailMessages.toEmails,
      excludedAt: emailMessages.aiExcludedAt,
      createdAt: emailMessages.createdAt,
      hasCase: emailMessages.caseId,
      customerName: recallCases.customerName,
      caseId: recallCases.caseId,
      serial: recallCases.serialNumber,
    })
    .from(emailMessages)
    .leftJoin(recallCases, eq(emailMessages.caseId, recallCases.id))
    .where(and(...conds))
    .orderBy(desc(emailMessages.createdAt))
    .limit(EXAMPLES_MAX);
  return rows.map((r) => {
    // Sin caso no hay nombre conocido: el nombre del saludo inicial se reemplaza igual.
    const ctx = { names: [r.customerName], caseId: r.caseId, serial: r.serial, greeting: !r.hasCase };
    let body = stripManualFooter(r.bodyText);
    let subject = r.subject;
    // Además del patrón general de correos, se quitan literalmente las direcciones del destinatario.
    for (const addr of r.toEmails.split(/[,;\s]+/).filter(Boolean)) {
      body = body.split(addr).join("[correo]");
      subject = subject.split(addr).join("[correo]");
    }
    let text = redactForAi(body, ctx);
    if (text.length > EXAMPLE_TEXT_MAX) text = `${text.slice(0, EXAMPLE_TEXT_MAX)}…`;
    return { id: r.id, subject: redactForAi(subject, ctx), text, excluded: r.excludedAt !== null, createdAt: r.createdAt };
  });
}

/** Últimas respuestas manuales enviadas (anonimizadas y sin firma), más recientes primero. */
export async function listExampleReplies(opts: { includeExcluded?: boolean } = {}): Promise<ExampleReply[]> {
  return queryExamples(opts.includeExcluded ? "all" : "used");
}

/** Lo que usa la IA (las últimas 20 no excluidas) y, aparte, las excluidas más recientes. Misma consulta que buildAiContext. */
export async function listExamplesForAdmin(): Promise<{ used: ExampleReply[]; excluded: ExampleReply[] }> {
  const [used, excluded] = await Promise.all([queryExamples("used"), queryExamples("excluded")]);
  return { used, excluded };
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

/** Hechos para la IA: contexto fijo y fichas activas del equipo (sin ejemplos). */
export async function buildFacts(): Promise<string> {
  const knowledge = await listKnowledge();
  const cards = knowledge.filter((k) => k.active).map((k) => `## ${k.title}\n${k.body}`);
  return [fixedContext(), ...(cards.length ? ["FICHAS DEL EQUIPO", ...cards] : [])].join("\n\n");
}

/** Hechos más respuestas de ejemplo (para la propuesta de respuesta). */
export async function buildAiContext(): Promise<{ facts: string; examples: string }> {
  const [facts, examples] = await Promise.all([buildFacts(), listExampleReplies()]);
  const ex = examples.map((e, i) => `Ejemplo ${i + 1}\nAsunto: ${e.subject}\n${e.text}`).join("\n\n---\n\n");
  return { facts, examples: ex };
}
