import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { setupTestEnv } from "./helpers";

setupTestEnv("recordatorio");
process.env.CRON_SECRET = "secreto-de-pruebas-cron-123456";

const { GET: cron } = await import("@/app/api/cron/recordatorios/route");
const { getDb } = await import("@/db/client");
const { auditEvents, recallCases, serialLookups } = await import("@/db/schema");
const { sendAffectedReminders } = await import("@/lib/recall/affected-reminders");
const { affectedReminderEmail } = await import("@/lib/email/templates");

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-29T13:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * HOUR);

async function consulta(serial: string, email: string | null, contactAt: Date, result: "AFFECTED" | "REINFORCED" = "AFFECTED") {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(serialLookups).values({ id, serialNormalized: serial, result, contactEmail: email, contactAt: email ? contactAt : null, createdAt: contactAt });
  return id;
}

async function recordado(id: string) {
  const db = await getDb();
  const [row] = await db.select({ at: serialLookups.reminderSentAt }).from(serialLookups).where(eq(serialLookups.id, id));
  return row!.at;
}

describe("Recordatorio automático a consultas afectadas sin registro", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("envía un correo por persona tras 24 h, solo si no hay caso, y una sola vez", async () => {
    const a1 = await consulta("A00000001", "uno@example.test", ago(30));
    const a2 = await consulta("A00000002", "uno@example.test", ago(26)); // misma persona, otra serie
    const reciente = await consulta("A00000003", "dos@example.test", ago(2)); // aún no cumple 24 h
    const conCaso = await consulta("A00000004", "tres@example.test", ago(40));
    const ok = await consulta("A00000005", "ok@example.test", ago(40), "REINFORCED"); // no afectada
    const sinCorreo = await consulta("A00000006", null, ago(40));

    const db = await getDb();
    await db.insert(recallCases).values({
      caseId: "RCDH-REC01",
      customerName: "Prueba",
      rut: "11111111-1",
      email: "otra@example.test",
      phone: "+56 9 0000 0000",
      region: "Metropolitana de Santiago",
      city: "Santiago",
      serialNumber: "A00000004",
      serialRaw: "A00000004",
      model: "COLLOSUS_DH7",
      size: "M",
      damageReported: "NO",
      accidentReported: false,
      acknowledgedStopRiding: true,
      serialVerificationStatus: "AFFECTED",
      requestType: "REPLACEMENT",
      caseStatus: "REGISTERED",
    });

    const dry = await sendAffectedReminders({ now: NOW, dryRun: true });
    expect(dry).toEqual({ candidates: 2, sent: 1, skippedWithCase: 1, failed: 0 });
    expect(await recordado(a1)).toBeNull();

    const r1 = await sendAffectedReminders({ now: NOW });
    expect(r1).toEqual({ candidates: 2, sent: 1, skippedWithCase: 1, failed: 0 });
    expect(await recordado(a1)).toEqual(NOW);
    expect(await recordado(a2)).toEqual(NOW);
    for (const id of [reciente, conCaso, ok, sinCorreo]) expect(await recordado(id)).toBeNull();

    const sent = (await db.select().from(auditEvents).where(eq(auditEvents.type, "EMAIL_SENT"))).filter(
      (e) => (e.payload as { kind?: string }).kind === "CUSTOMER_AFFECTED_REMINDER",
    );
    expect(sent).toHaveLength(1);
    expect((sent[0]!.payload as { caseId: string }).caseId).toBe("A00000001, A00000002");

    // Segunda corrida: nada nuevo. Una consulta posterior de la misma persona no genera otro recordatorio.
    const otraVez = await consulta("A00000001", "uno@example.test", ago(25));
    const r2 = await sendAffectedReminders({ now: NOW });
    expect(r2).toMatchObject({ sent: 0 });
    expect(await recordado(otraVez)).toEqual(NOW);
  });

  it("el texto usa los avisos del sitio y enlaza al formulario", () => {
    const m = affectedReminderEmail(["A00000001", "A00000002"], { siteUrl: "https://recallcollosusdh.cl" });
    expect(m.subject).toBe("Recordatorio: no utilices tu bicicleta – Polygon Collosus DH");
    expect(m.text).toContain("número de serie A00000001, A00000002");
    expect(m.text).toContain("NO UTILICES LA BICICLETA");
    expect(m.text).toContain("https://www.recallcollosusdh.cl/");
    expect(m.html).toContain("INICIAR PROCESO DE REEMPLAZO");
  });

  it("la ruta del cron exige el secreto", async () => {
    const req = (auth?: string) => new NextRequest(new Request("http://localhost/api/cron/recordatorios", { headers: auth ? { authorization: auth } : {} }));
    expect((await cron(req())).status).toBe(401);
    expect((await cron(req("Bearer otro"))).status).toBe(401);
    const res = await cron(req("Bearer secreto-de-pruebas-cron-123456"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
