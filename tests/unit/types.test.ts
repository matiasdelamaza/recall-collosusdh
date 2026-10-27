import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS, requestTypeForState } from "@/lib/types";

describe("requestTypeForState", () => {
  it("una unidad afectada abre el flujo de reemplazo", () => {
    expect(requestTypeForState("AFFECTED")).toBe("REPLACEMENT");
  });

  it("modo interino abre el registro pendiente de base", () => {
    expect(requestTypeForState("PENDING_DATABASE")).toBe("PENDING_DATABASE");
  });

  it("no identificada y no verificable abren revisión manual", () => {
    expect(requestTypeForState("NOT_IDENTIFIED")).toBe("MANUAL_REVIEW");
    expect(requestTypeForState("UNVERIFIED")).toBe("MANUAL_REVIEW");
  });
});

describe("ANALYTICS_EVENTS", () => {
  it("incluye los eventos del brief y ninguno con datos personales", () => {
    const required = [
      "page_view",
      "serial_check_started",
      "serial_check_affected",
      "serial_check_not_identified",
      "serial_check_manual_review",
      "registration_started",
      "registration_completed",
      "manual_review_requested",
      "contact_clicked",
    ];
    for (const e of required) expect(ANALYTICS_EVENTS).toContain(e);
    for (const e of ANALYTICS_EVENTS) expect(e).toMatch(/^[a-z_]+$/);
  });
});
