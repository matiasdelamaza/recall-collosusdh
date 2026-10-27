import Link from "next/link";
import type { RecallCase } from "@/db/schema";
import { ADMIN } from "@/lib/copy/es-admin";
import { fmtDateTime, labelModel, labelRequestType, labelSize, labelTri, labelYesNo } from "./format";
import { PriorityBadge, StatusBadge, VerificationBadge } from "./ui";

const C = ADMIN.cases.columns;

export function CasesTable({ rows }: { rows: RecallCase[] }) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-line bg-paper-100 p-6 text-center text-sm text-ink-500">{ADMIN.cases.empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
        <thead className="bg-paper-100 text-[11px] uppercase tracking-wider text-ink-500">
          <tr>
            <Th>{C.caseId}</Th>
            <Th>{C.createdAt}</Th>
            <Th>{C.customer}</Th>
            <Th>{C.phone}</Th>
            <Th>{C.serial}</Th>
            <Th>{C.modelSize}</Th>
            <Th>{C.verification}</Th>
            <Th>{C.requestType}</Th>
            <Th>{C.priority}</Th>
            <Th>{C.damage}</Th>
            <Th>{C.accident}</Th>
            <Th>{C.status}</Th>
            <Th>{C.assignedTo}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-t border-line align-top hover:bg-paper-100 ${r.priority === "HIGH" ? "bg-alert-50/40" : ""}`}>
              <Td>
                <Link href={`/admin/casos/${encodeURIComponent(r.caseId)}`} className="font-mono font-bold text-ink underline underline-offset-2">
                  {r.caseId}
                </Link>
              </Td>
              <Td className="whitespace-nowrap text-ink-500">{fmtDateTime(r.createdAt)}</Td>
              <Td>
                <div className="font-semibold">{r.customerName}</div>
                <div className="text-xs text-ink-500">{r.email}</div>
              </Td>
              <Td className="whitespace-nowrap">{r.phone}</Td>
              <Td className="font-mono">{r.serialNumber}</Td>
              <Td className="whitespace-nowrap">
                {labelModel(r.model)} / {labelSize(r.size)}
              </Td>
              <Td>
                <VerificationBadge status={r.serialVerificationStatus} />
              </Td>
              <Td className="whitespace-nowrap">{labelRequestType(r.requestType)}</Td>
              <Td>
                <PriorityBadge priority={r.priority} />
              </Td>
              <Td className={r.damageReported === "YES" ? "font-bold text-alert-700" : ""}>{labelTri(r.damageReported)}</Td>
              <Td className={r.accidentReported ? "font-bold text-alert-700" : ""}>{labelYesNo(r.accidentReported)}</Td>
              <Td>
                <StatusBadge status={r.caseStatus} />
              </Td>
              <Td>{r.assignedTo ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 font-semibold">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-2 ${className}`}>{children}</td>;
}
