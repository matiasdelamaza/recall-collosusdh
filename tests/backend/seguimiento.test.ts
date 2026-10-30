import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestEnv } from "./helpers";

setupTestEnv("seguimiento");

const { getDb } = await import("@/db/client");
const { auditEvents, recallCases, serialLookups } = await import("@/db/schema");
const { notifyStageChange, sendWeeklyFollowUps, sendBroadcast, getBroadcastAudience } = await import("@/lib/recall/follow-up");
const { customerFollowUpEmail } = await import("@/lib/email/templates");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-10T13:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

type CaseOverrides = Partial<typeof recallCases.$inferInsert> & { caseId: string };

async function caso(o: CaseOverrides) {
  const db = await getDb();
  const [row] = await db
    .insert(recallCases)
    .values({
      customerName: "Prueba Seguimiento",
      rut: "11111111-1",
      email: `${o.caseId.toLowerCase()}@example.test`,
      phone: "+56 9 0000 0000",
      region: "Metropolitana de Santiago",
      city: "Santiago",
      serialNumber: `S-${o.caseId}`,
      serialRaw: `S-${o.caseId}`,
      model: "COLLOSUS_DH9",
      size: "M",
      damageReported: "NO",
      accidentReported: false,
      acknowledgedStopRiding: true,
      serialVerificationStatus: "AFFECTED",
      requestType: "REPLACEMENT",
      caseStatus: "REGISTERED",
      ...o,
    })
    .returning();
  return row!;
}

async function emailsOfKind(kind: string) {
  const db = await getDb();
  return (await db.select().from(auditEvents).where(eq(auditEvents.type, "EMAIL_SENT"))).filter((e) => (e.payload as { kind?: string }).kind === kind);
}

describe("Seguimiento por correo a clientes con unidad afectada", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("avisa el cambio de etapa solo a unidades afectadas y en etapas del reemplazo", async () => {
    const a = await caso({ caseId: "RCDH-SEG01", caseStatus: "VALIDATED" });
    expect(await notifyStageChange(a)).toBe(true);
    const db = await getDb();
    const [row] = await db.select().from(recallCases).where(eq(recallCases.id, a.id));
    expect(row!.lastCustomerUpdateAt).toBeInstanceOf(Date);

    expect(await notifyStageChange(await caso({ caseId: "RCDH-SEG02", caseStatus: "MANUAL_REVIEW" }))).toBe(false);
    expect(await notifyStageChange(await caso({ caseId: "RCDH-SEG03", caseStatus: "VALIDATED", serialVerificationStatus: "REINFORCED", requestType: "MANUAL_REVIEW" }))).toBe(false);
    expect(await notifyStageChange(await caso({ caseId: "RCDH-SEG04", caseStatus: "REGISTERED" }))).toBe(false);
    expect(await emailsOfKind("CUSTOMER_FOLLOW_UP")).toHaveLength(1);
  });

  it("la novedad semanal va a casos en curso sin correo hace 7 días", async () => {
    const db = await getDb();
    await db.delete(recallCases);
    const vieja = await caso({ caseId: "RCDH-SEM01", createdAt: daysAgo(8) });
    const reciente = await caso({ caseId: "RCDH-SEM02", createdAt: daysAgo(3) });
    const avisada = await caso({ caseId: "RCDH-SEM03", createdAt: daysAgo(20), lastCustomerUpdateAt: daysAgo(2) });
    const terminada = await caso({ caseId: "RCDH-SEM04", createdAt: daysAgo(20), caseStatus: "REPLACED" });

    expect(await sendWeeklyFollowUps({ now: NOW, dryRun: true })).toEqual({ due: 1, sent: 0, failed: 0 });
    expect(await sendWeeklyFollowUps({ now: NOW })).toEqual({ due: 1, sent: 1, failed: 0 });
    const updated = await db.select().from(recallCases);
    const at = (id: string) => updated.find((c) => c.id === id)!.lastCustomerUpdateAt;
    expect(at(vieja.id)).toBeInstanceOf(Date);
    expect(at(reciente.id)).toBeNull();
    expect(at(avisada.id)).toEqual(daysAgo(2));
    expect(at(terminada.id)).toBeNull();
  });

  it("el comunicado llega a los casos en curso y, si se pide, a correos sin caso (sin repetir)", async () => {
    const db = await getDb();
    await db.delete(recallCases);
    await caso({ caseId: "RCDH-COM01", caseStatus: "FRAME_IN_TRANSIT" });
    await caso({ caseId: "RCDH-COM02", caseStatus: "CLOSED" });
    await db.insert(serialLookups).values([
      { serialNormalized: "S-SINCASO-1", result: "AFFECTED", contactEmail: "sincaso@example.test", contactAt: NOW },
      { serialNormalized: "S-SINCASO-2", result: "AFFECTED", contactEmail: "sincaso@example.test", contactAt: NOW },
      { serialNormalized: "S-RCDH-COM01", result: "AFFECTED", contactEmail: "otra@example.test", contactAt: NOW }, // ya tiene caso
    ]);

    expect(await getBroadcastAudience()).toEqual({ cases: 1, contacts: 1 });
    const msg = { subject: "Novedades sobre los cuadros", body: "Los cuadros de reemplazo ya están en camino a Chile." };
    expect(await sendBroadcast(msg, { includeContacts: false, actor: "prueba" })).toMatchObject({ cases: 1, contacts: 0, sent: 1, failed: 0 });
    expect(await sendBroadcast(msg, { includeContacts: true, actor: "prueba" })).toMatchObject({ cases: 1, contacts: 1, sent: 2, failed: 0 });

    const audits = await db.select().from(auditEvents).where(eq(auditEvents.type, "BROADCAST_SENT"));
    expect(audits).toHaveLength(2);
    expect(audits[0]!.actor).toBe("prueba");
  });

  it("el correo muestra la etapa actual, las etapas y el aviso de no usar la bicicleta", () => {
    const c = { caseId: "RCDH-ABC23", customerName: "Ana", serialNumber: "H24003418", caseStatus: "FRAME_IN_TRANSIT" as const };
    const m = customerFollowUpEmail(c, "STAGE", { siteUrl: "https://recallcollosusdh.cl", contactEmail: "contacto@crossmountain.cl" });
    expect(m.subject).toBe("Tu caso RCDH-ABC23 avanzó – Polygon Collosus DH");
    expect(m.text).toContain("avanzó a la etapa: Cuadro en tránsito.");
    expect(m.text).toContain("✓ Cuadro de reemplazo asignado\n→ Cuadro en tránsito\n· Cuadro recibido");
    expect(m.text).toContain("NO UTILICES LA BICICLETA");

    const done = customerFollowUpEmail({ ...c, caseStatus: "REPLACED" }, "STAGE", { siteUrl: "https://recallcollosusdh.cl" });
    expect(done.subject).toBe("Reemplazo realizado – caso RCDH-ABC23");
    expect(done.text).not.toContain("NO UTILICES LA BICICLETA");
    expect(done.text).toContain("✓ Reemplazo realizado");

    const weekly = customerFollowUpEmail(c, "BROADCAST", { siteUrl: "https://recallcollosusdh.cl" }, { subject: "Novedades", body: "Mensaje de Postventa." });
    expect(weekly.subject).toBe("Novedades");
    expect(weekly.text).toContain("Mensaje de Postventa.");
  });
});
