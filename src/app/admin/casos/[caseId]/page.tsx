import Link from "next/link";
import { notFound } from "next/navigation";
import { CallForm } from "@/components/admin/CallForm";
import { CaseActions } from "@/components/admin/CaseActions";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { MessageTimeline, SignalBadge, SignalReasons } from "@/components/admin/mail";
import {
  fmtDateTime,
  fmtRut,
  labelAuditType,
  labelFileKind,
  labelModel,
  labelRequestType,
  labelSize,
  labelTri,
  labelYesNo,
  summarizeAuditPayload,
} from "@/components/admin/format";
import { AlertBox, Card, FieldRow, Flash, PageHeader, PriorityBadge, StatusBadge, VerificationBadge, buttonSecondary } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/session";
import { ADMIN } from "@/lib/copy/es-admin";
import { getCaseByCaseId } from "@/lib/recall/cases";
import { EMPTY_MAIL_STATS, caseSignal, getCaseMessages, getMailStats } from "@/lib/recall/mailbox";

export const dynamic = "force-dynamic";
// La propuesta de respuesta con IA puede tardar hasta ~40 s.
export const maxDuration = 60;

type Search = Record<string, string | string[] | undefined>;
const D = ADMIN.caseDetail;
const F = D.fields;

const MESSAGES: Record<string, { kind: "ok" | "error"; text: string }> = {
  statusUpdated: { kind: "ok", text: D.messages.statusUpdated },
  statusUpdatedNotified: { kind: "ok", text: D.messages.statusUpdatedNotified },
  assigned: { kind: "ok", text: D.messages.assigned },
  noteAdded: { kind: "ok", text: D.messages.noteAdded },
  replacementSaved: { kind: "ok", text: D.messages.replacementSaved },
  invalid: { kind: "error", text: D.messages.invalid },
  called: { kind: "ok", text: ADMIN.mesa.called },
};

export default async function AdminCaseDetailPage({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: Promise<Search> }) {
  await requireAdmin();
  const { caseId } = await params;
  const sp = await searchParams;
  const detail = await getCaseByCaseId(decodeURIComponent(caseId));
  if (!detail) notFound();
  const { case: c, files, notes, audit } = detail;
  const msgKey = Array.isArray(sp.msg) ? sp.msg[0] : sp.msg;
  const msg = msgKey ? MESSAGES[msgKey] : undefined;
  const [messages, stats] = await Promise.all([getCaseMessages(c.id), getMailStats([c.id])]);
  const signal = caseSignal(c, stats.get(c.id) ?? EMPTY_MAIL_STATS);
  const lastIn = [...messages].reverse().find((m) => m.direction === "IN");

  return (
    <>
      <div className="mb-3">
        <Link href="/admin" className="text-sm font-semibold text-ink-500 underline underline-offset-2">
          ← {D.back}
        </Link>
      </div>
      <PageHeader title={`${D.title} ${c.caseId}`}>
        <SignalBadge level={signal.level} />
        <PriorityBadge priority={c.priority} />
        <VerificationBadge status={c.serialVerificationStatus} />
        <StatusBadge status={c.caseStatus} />
      </PageHeader>

      {msg ? <Flash kind={msg.kind}>{msg.text}</Flash> : null}

      <div className="mb-4 grid gap-2">
        {c.accidentReported ? <AlertBox>{D.alerts.accident}</AlertBox> : null}
        {c.damageReported === "YES" ? <AlertBox>{D.alerts.damage}</AlertBox> : null}
        {c.damageReported === "NOT_SURE" ? <AlertBox tone="caution">{D.alerts.damageNotSure}</AlertBox> : null}
        {c.caseStatus === "DUPLICATE_CASE" ? <AlertBox tone="caution">{D.alerts.duplicate}</AlertBox> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-4">
          <Card title={D.sections.customer}>
            <dl>
              <FieldRow label={F.name}>{c.customerName}</FieldRow>
              <FieldRow label={F.rut} mono>
                {fmtRut(c.rut)}
              </FieldRow>
              <FieldRow label={F.email}>
                <a href={`mailto:${c.email}`} className="underline underline-offset-2">
                  {c.email}
                </a>
              </FieldRow>
              <FieldRow label={F.phone}>
                <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="underline underline-offset-2">
                  {c.phone}
                </a>
              </FieldRow>
              <FieldRow label={F.region}>{c.region}</FieldRow>
              <FieldRow label={F.city}>{c.city}</FieldRow>
            </dl>
          </Card>

          <Card title={D.sections.bike}>
            <dl>
              <FieldRow label={F.serial} mono>
                <span className="text-base font-bold">{c.serialNumber}</span>
              </FieldRow>
              {c.serialRaw !== c.serialNumber ? (
                <FieldRow label={F.serialRaw} mono>
                  {c.serialRaw}
                </FieldRow>
              ) : null}
              <FieldRow label={F.model}>{labelModel(c.model)}</FieldRow>
              <FieldRow label={F.size}>{labelSize(c.size)}</FieldRow>
              <FieldRow label={F.dealer}>{c.dealer || "—"}</FieldRow>
              <FieldRow label={F.purchaseDate}>{c.purchaseDate || "—"}</FieldRow>
            </dl>
          </Card>

          <Card title={D.sections.incident}>
            <dl>
              <FieldRow label={F.damage}>
                <span className={c.damageReported === "YES" ? "font-bold text-alert-700" : ""}>{labelTri(c.damageReported)}</span>
              </FieldRow>
              <FieldRow label={F.accident}>
                <span className={c.accidentReported ? "font-bold text-alert-700" : ""}>{labelYesNo(c.accidentReported)}</span>
              </FieldRow>
              {c.incidentDescription ? (
                <FieldRow label={F.incidentDescription}>
                  <p className="whitespace-pre-wrap">{c.incidentDescription}</p>
                </FieldRow>
              ) : null}
              <FieldRow label={F.acknowledged}>{labelYesNo(c.acknowledgedStopRiding)}</FieldRow>
            </dl>
          </Card>

          <Card title={D.sections.files}>
            {files.length === 0 ? (
              <p className="text-sm text-ink-500">{D.noFiles}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {files.map((f) => (
                  <li key={f.id} className="rounded-md border border-line p-2">
                    <a href={`/api/admin/archivos/${f.id}`} target="_blank" rel="noopener noreferrer" title={D.actions.openFile}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/admin/archivos/${f.id}?miniatura=1`} alt={labelFileKind(f.kind)} className="aspect-square w-full rounded-sm bg-paper-100 object-cover" loading="lazy" />
                    </a>
                    <div className="mt-1 text-xs font-semibold">{labelFileKind(f.kind)}</div>
                    <div className="truncate text-[11px] text-ink-500" title={f.originalName}>
                      {f.originalName} · {Math.round(f.sizeBytes / 1024)} KB
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={ADMIN.inbox.caseCardTitle}>
            {signal.reasons.length > 0 ? (
              <div className="mb-3 text-sm font-semibold text-alert-700">
                <SignalReasons reasons={signal.reasons} />
              </div>
            ) : null}
            {messages.length === 0 ? <p className="mb-3 text-sm text-ink-500">{ADMIN.inbox.caseCardEmpty}</p> : <MessageTimeline messages={messages} linkEach />}
            <div className="mt-4 grid gap-4 border-t border-line pt-4">
              <div>
                <p className="mb-1 text-xs text-ink-500">
                  {ADMIN.mesa.lastCall}: {c.lastCallAt ? fmtDateTime(c.lastCallAt) : ADMIN.mesa.never}
                </p>
                <CallForm caseId={c.caseId} back={`/admin/casos/${c.caseId}`} />
              </div>
              <EmailComposer
                title={lastIn ? ADMIN.inbox.composeTitle : ADMIN.inbox.composeNewTitle}
                target={{
                  caseId: c.caseId,
                  to: c.email,
                  firstName: c.customerName.split(/\s+/)[0] ?? null,
                  serial: c.serialNumber,
                  replySubject: lastIn ? (/^re:/i.test(lastIn.subject) ? lastIn.subject : `Re: ${lastIn.subject}`) : undefined,
                }}
                draft={{ caseId: c.caseId }}
                aiEnabled={Boolean(process.env.OPENROUTER_API_KEY)}
              />
            </div>
          </Card>

          <Card title={D.sections.notes}>
            {notes.length === 0 ? (
              <p className="text-sm text-ink-500">{D.noNotes}</p>
            ) : (
              <ul className="grid gap-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-sm border border-line bg-paper-100 p-2 text-sm">
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-500">
                      {n.author} · {fmtDateTime(n.createdAt)}
                    </div>
                    <p className="whitespace-pre-wrap">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={D.sections.audit}>
            {audit.length === 0 ? (
              <p className="text-sm text-ink-500">{D.noAudit}</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap gap-x-3 border-b border-line py-1 last:border-b-0">
                    <span className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(a.createdAt)}</span>
                    <span className="font-semibold">{labelAuditType(a.type)}</span>
                    <span className="text-ink-500">{a.actor}</span>
                    <span className="text-ink-700">{summarizeAuditPayload(a.type, a.payload)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title={D.sections.verification}>
            <dl>
              <FieldRow label={F.verification}>
                <VerificationBadge status={c.serialVerificationStatus} />
              </FieldRow>
              <FieldRow label={F.requestType}>{labelRequestType(c.requestType)}</FieldRow>
              <FieldRow label={F.priority}>
                <PriorityBadge priority={c.priority} />
              </FieldRow>
              <FieldRow label={F.status}>
                <StatusBadge status={c.caseStatus} />
              </FieldRow>
              <FieldRow label={F.assignedTo}>{c.assignedTo || "—"}</FieldRow>
              <FieldRow label={F.replacementSerial} mono>
                {c.replacementFrameSerial || "—"}
              </FieldRow>
              <FieldRow label={F.replacementVersion}>{c.replacementFrameVersion || "—"}</FieldRow>
            </dl>
          </Card>

          <CaseActions c={c} />

          <Card title={D.sections.meta}>
            <dl>
              <FieldRow label={F.createdAt}>{fmtDateTime(c.createdAt)}</FieldRow>
              <FieldRow label={F.updatedAt}>{fmtDateTime(c.updatedAt)}</FieldRow>
              <FieldRow label={F.closedAt}>{fmtDateTime(c.closedAt)}</FieldRow>
              <FieldRow label={F.resultNotifiedAt}>{fmtDateTime(c.resultNotifiedAt)}</FieldRow>
              <FieldRow label={F.lastCustomerUpdateAt}>{fmtDateTime(c.lastCustomerUpdateAt)}</FieldRow>
              <FieldRow label={F.source}>{c.source}</FieldRow>
              <FieldRow label={F.outreachRef}>{c.outreachRef ? <span className="font-mono">{c.outreachRef}</span> : "—"}</FieldRow>
              <FieldRow label={F.internalId} mono>
                {c.id}
              </FieldRow>
            </dl>
          </Card>

          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/exportar/casos.csv?q=${encodeURIComponent(c.caseId)}`} className={buttonSecondary}>
              {ADMIN.cases.exportCsv}
            </a>
            <a href={`/api/admin/exportar/casos.xlsx?q=${encodeURIComponent(c.caseId)}`} className={buttonSecondary}>
              {ADMIN.cases.exportXlsx}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
