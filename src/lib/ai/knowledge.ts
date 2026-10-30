/**
 * Contexto que se entrega a la IA: contexto fijo (preguntas frecuentes y plantillas), el texto de
 * contexto que carga el equipo y respuestas manuales anteriores usadas como ejemplo.
 * Todo texto de ejemplo se anonimiza antes de salir de este módulo.
 */
import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, ne, notInArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiKnowledge, emailMessages, recallCases } from "@/db/schema";
import { ADMIN } from "@/lib/copy/es-admin";
import { EMAIL, FAQ } from "@/lib/copy/es";
import { logAudit } from "@/lib/server/audit";
import { redactForAi } from "./redact";

/** Máximo de caracteres del texto de contexto del equipo. */
export const KNOWLEDGE_TOTAL_MAX = 40_000;
export const EXAMPLES_MAX = 20;
/** Título con que se guarda el texto de contexto (una sola fila en ai_knowledge). */
const TEAM_CONTEXT_TITLE = "Contexto del equipo";

export type SaveKnowledgeResult = { ok: true } | { ok: false; error: "tooLong" };

/** Texto de contexto que cargó el equipo, con su última carga (null si no hay). */
export async function getTeamContextRow(): Promise<{ body: string; updatedAt: Date; updatedBy: string | null } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ body: aiKnowledge.body, updatedAt: aiKnowledge.updatedAt, updatedBy: aiKnowledge.updatedBy })
    .from(aiKnowledge)
    .where(eq(aiKnowledge.active, true))
    .orderBy(asc(aiKnowledge.createdAt))
    .limit(1);
  return row ?? null;
}

/** Texto de contexto que cargó el equipo ("" si no hay). */
export async function getTeamContext(): Promise<string> {
  return (await getTeamContextRow())?.body ?? "";
}

/** Reemplaza el texto de contexto del equipo; vacío lo borra. */
export async function saveTeamContext(input: string, actor: string): Promise<SaveKnowledgeResult> {
  const body = input.replace(/\r\n/g, "\n").trim();
  if (body.length > KNOWLEDGE_TOTAL_MAX) return { ok: false, error: "tooLong" };

  const db = await getDb();
  const [first] = await db.select({ id: aiKnowledge.id }).from(aiKnowledge).orderBy(asc(aiKnowledge.createdAt)).limit(1);
  if (!body) {
    await db.delete(aiKnowledge);
  } else if (first) {
    await db.update(aiKnowledge).set({ title: TEAM_CONTEXT_TITLE, body, active: true, updatedAt: new Date(), updatedBy: actor }).where(eq(aiKnowledge.id, first.id));
    // Quedaba de cuando había varias fichas: solo vale una.
    await db.delete(aiKnowledge).where(ne(aiKnowledge.id, first.id));
  } else {
    await db.insert(aiKnowledge).values({ title: TEAM_CONTEXT_TITLE, body, active: true, updatedBy: actor });
  }
  await logAudit({ type: "AI_KNOWLEDGE_CHANGED", actor, payload: { action: body ? "save" : "clear", length: body.length } });
  return { ok: true };
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

/** Hechos para la IA: contexto fijo y texto de contexto del equipo (sin ejemplos). */
export async function buildFacts(): Promise<string> {
  const team = await getTeamContext();
  return [fixedContext(), ...(team ? ["CONTEXTO DEL EQUIPO", team] : [])].join("\n\n");
}

/** Hechos más respuestas de ejemplo (para la propuesta de respuesta). */
export async function buildAiContext(): Promise<{ facts: string; examples: string }> {
  const [facts, examples] = await Promise.all([buildFacts(), listExampleReplies()]);
  const ex = examples.map((e, i) => `Ejemplo ${i + 1}\nAsunto: ${e.subject}\n${e.text}`).join("\n\n---\n\n");
  return { facts, examples: ex };
}
