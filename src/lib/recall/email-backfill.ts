/**
 * Reconstrucción de la bitácora de correos por caso (30-10-2026).
 * La bitácora (email_messages) existe desde la migración 0006: los correos anteriores quedaron solo en la
 * auditoría (EMAIL_SENT) o, el aviso directo del 27-10, en la lista local de scripts/enviar-aviso.ts.
 * Aquí se vuelven a generar con la misma plantilla, con su fecha real, y quedan rotulados como reconstruidos.
 * Se puede repetir: nada se inserta dos veces.
 */
import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditEvents, emailMessages, recallCases, type RecallCase } from "@/db/schema";
import { getEnv } from "@/lib/config";
import {
  customerConfirmationEmail,
  customerResultAffectedEmail,
  customerResultNotIdentifiedEmail,
  customerResultReinforcedEmail,
  outreachCustomerEmail,
  type EmailContext,
  type RenderedEmail,
} from "@/lib/email/templates";
import { logAudit } from "@/lib/server/audit";
import { detectDelimiter } from "./import";
import { parseAddress } from "./mailbox";
import { getEmailContext } from "./notifications";

export const REBUILT_ACTOR = "Reconstruido del registro";
export const OUTREACH_ACTOR = "Aviso del 27-10 (importado)";
export const OUTREACH_KIND = "INITIAL_OUTREACH";

/** Mismos valores con que scripts/enviar-aviso.ts envió el aviso a clientes. */
const OUTREACH_FROM = "contacto@crossmountain.cl";
const OUTREACH_CONTEXT: EmailContext = { siteUrl: "https://recallcollosusdh.cl", contactEmail: "contacto@crossmountain.cl" };

const RENDERERS: Record<string, (c: RecallCase, ctx: EmailContext) => RenderedEmail> = {
  CUSTOMER_CONFIRMATION: customerConfirmationEmail,
  CUSTOMER_RESULT_AFFECTED: customerResultAffectedEmail,
  CUSTOMER_RESULT_REINFORCED: customerResultReinforcedEmail,
  CUSTOMER_RESULT_NOT_IDENTIFIED: customerResultNotIdentifiedEmail,
};

export interface RebuildResult {
  inserted: number;
  existing: number;
}

/** Confirmaciones y resultados enviados a casos antes de que existiera la bitácora. */
export async function rebuildCaseEmails(actor: string): Promise<RebuildResult> {
  const db = await getDb();
  const events = await db
    .select({ e: auditEvents, c: recallCases })
    .from(auditEvents)
    .innerJoin(recallCases, eq(auditEvents.caseId, recallCases.id))
    .where(and(eq(auditEvents.type, "EMAIL_SENT"), isNotNull(auditEvents.caseId), inArray(sql<string>`${auditEvents.payload}->>'kind'`, Object.keys(RENDERERS))))
    .orderBy(auditEvents.createdAt);

  const ctx = getEmailContext();
  const fromEmail = parseAddress(getEnv().EMAIL_FROM).email;
  let inserted = 0;
  let existing = 0;
  for (const { e, c } of events) {
    const kind = String(e.payload?.kind);
    const providerId = typeof e.payload?.id === "string" && e.payload.id ? e.payload.id : null;
    // Sin id del proveedor, el mismo caso, tipo y hora identifican el envío.
    const [dup] = await db
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(providerId ? eq(emailMessages.providerId, providerId) : and(eq(emailMessages.caseId, c.id), eq(emailMessages.kind, kind), eq(emailMessages.createdAt, e.createdAt)))
      .limit(1);
    if (dup) {
      existing++;
      continue;
    }
    const rendered = RENDERERS[kind]!(c, ctx);
    const rows = await db
      .insert(emailMessages)
      .values({
        caseId: c.id,
        direction: "OUT",
        kind,
        fromEmail,
        toEmails: c.email.trim().toLowerCase(),
        subject: rendered.subject,
        bodyText: rendered.text,
        providerId,
        status: "SENT",
        statusAt: e.createdAt,
        actor: REBUILT_ACTOR,
        createdAt: e.createdAt,
      })
      .onConflictDoNothing()
      .returning();
    if (rows.length) inserted++;
    else existing++;
  }
  await logAudit({ type: "EMAIL_LOG_REBUILT", actor, payload: { source: "audit", inserted, existing } });
  return { inserted, existing };
}

// ── Aviso directo del 27-10 (lista de clientes de scripts/enviar-aviso.ts) ──

/** CSV con comillas dobles (RFC 4180). */
function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/** Diferencia en minutos entre la hora de Santiago y UTC en ese instante. */
function santiagoOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "27-10-2026, 2:56:56 p. m." (hora de Santiago, como la escribe enviar-aviso.ts) → Date. Exportado para pruebas. */
export function parseSentAt(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?/i);
  if (!m) return null;
  let hour = Number(m[4]);
  const ampm = m[7]?.toLowerCase();
  if (ampm === "p" && hour < 12) hour += 12;
  if (ampm === "a" && hour === 12) hour = 0;
  const local = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hour, Number(m[5]), Number(m[6] ?? 0));
  if (Number.isNaN(local)) return null;
  // Dos pasadas: la primera estima el instante y la segunda corrige si cae justo en un cambio de horario.
  let utc = local - santiagoOffsetMinutes(new Date(local)) * 60_000;
  utc = local - santiagoOffsetMinutes(new Date(utc)) * 60_000;
  return new Date(utc);
}

/** Filas con correo y fecha de envío de la lista de clientes. Exportado para pruebas. */
export function parseOutreachCsv(csvText: string): { rows: { email: string; sentAt: Date }[]; invalid: number } {
  const text = csvText.replace(/^﻿/, "");
  const [header, ...data] = parseCsvRows(text, detectDelimiter(text));
  const norm = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase();
  const iEmail = header?.findIndex((h) => norm(h) === "email") ?? -1;
  const iSent = header?.findIndex((h) => norm(h) === "correo enviado") ?? -1;
  if (iEmail < 0 || iSent < 0) throw new OutreachCsvError();
  const rows: { email: string; sentAt: Date }[] = [];
  let invalid = 0;
  for (const r of data) {
    const sent = (r[iSent] ?? "").trim();
    if (!sent) continue; // No se le envió.
    const email = (r[iEmail] ?? "").trim().toLowerCase();
    const sentAt = parseSentAt(sent);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !sentAt) {
      invalid++;
      continue;
    }
    rows.push({ email, sentAt });
  }
  return { rows, invalid };
}

export class OutreachCsvError extends Error {
  constructor() {
    super("Faltan las columnas Email y Correo enviado.");
  }
}

export interface OutreachImportResult {
  sent: number;
  inserted: number;
  existing: number;
  withoutCase: number;
  invalid: number;
}

/** Agrega el aviso del 27-10 a la bitácora de cada caso cuyo correo está en la lista. Quien no tiene caso se omite. */
export async function importOutreach(csvText: string, actor: string): Promise<OutreachImportResult> {
  const { rows, invalid } = parseOutreachCsv(csvText);
  const db = await getDb();
  const rendered = outreachCustomerEmail(OUTREACH_CONTEXT);
  let inserted = 0;
  let existing = 0;
  let withoutCase = 0;
  for (const r of rows) {
    const cases = await db
      .select({ id: recallCases.id })
      .from(recallCases)
      .where(sql`lower(trim(${recallCases.email})) = ${r.email}`);
    if (cases.length === 0) {
      withoutCase++;
      continue;
    }
    for (const c of cases) {
      const [dup] = await db
        .select({ id: emailMessages.id })
        .from(emailMessages)
        .where(and(eq(emailMessages.caseId, c.id), eq(emailMessages.kind, OUTREACH_KIND)))
        .limit(1);
      if (dup) {
        existing++;
        continue;
      }
      await db.insert(emailMessages).values({
        caseId: c.id,
        direction: "OUT",
        kind: OUTREACH_KIND,
        fromEmail: OUTREACH_FROM,
        toEmails: r.email,
        subject: rendered.subject,
        bodyText: rendered.text,
        status: "SENT",
        statusAt: r.sentAt,
        actor: OUTREACH_ACTOR,
        createdAt: r.sentAt,
      });
      inserted++;
    }
  }
  // Solo conteos: la lista tiene datos personales y no se guarda.
  await logAudit({ type: "EMAIL_LOG_REBUILT", actor, payload: { source: "outreach", sent: rows.length, inserted, existing, withoutCase, invalid } });
  return { sent: rows.length, inserted, existing, withoutCase, invalid };
}
