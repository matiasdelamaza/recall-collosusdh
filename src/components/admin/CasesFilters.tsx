import { CASE_STATUSES, PRIORITIES, REQUEST_TYPES, TRI_STATE } from "@/db/schema";
import { ADMIN } from "@/lib/copy/es-admin";
import { CASE_LIST_VERIFICATIONS, STATUS_ALL, STATUS_OPEN, VERIFICATION_ALL, type CaseListFilters } from "@/lib/recall/cases";
import { labelPriority, labelRequestType, labelStatus, labelTri, labelVerification } from "./format";
import { buttonPrimary, buttonSecondary, inputClass, labelClass, selectClass } from "./ui";

const F = ADMIN.cases.filters;

export function CasesFilters({ filters }: { filters: CaseListFilters }) {
  return (
    // key: al navegar por un enlace (p. ej. "Incluir cerrados") el formulario se rearma y los selectores muestran el filtro vigente.
    <form key={filtersToQuery(filters, { page: undefined })} method="get" action="/admin" className="mb-4 grid grid-cols-2 gap-3 rounded-md border border-line bg-paper-100 p-3 sm:grid-cols-3 lg:grid-cols-7">
      <div className="col-span-2 sm:col-span-3 lg:col-span-2">
        <label htmlFor="q" className={labelClass}>
          {ADMIN.cases.search}
        </label>
        <input id="q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder={ADMIN.cases.searchPlaceholder} className={inputClass} maxLength={120} />
      </div>
      <Select
        id="status"
        label={F.status}
        value={filters.status ?? STATUS_OPEN}
        allValue={STATUS_ALL}
        firstOptions={[[STATUS_OPEN, F.open]]}
        options={CASE_STATUSES.map((s) => [s, labelStatus(s)])}
      />
      <Select id="priority" label={F.priority} value={filters.priority ?? ""} options={PRIORITIES.map((s) => [s, labelPriority(s)])} />
      <Select id="requestType" label={F.requestType} value={filters.requestType ?? ""} options={REQUEST_TYPES.map((s) => [s, labelRequestType(s)])} />
      <Select id="verification" label={F.verification} value={filters.verification ?? ""} allValue={VERIFICATION_ALL} options={CASE_LIST_VERIFICATIONS.map((s) => [s, labelVerification(s)])} />
      <Select id="damage" label={F.damage} value={filters.damage ?? ""} options={TRI_STATE.map((s) => [s, labelTri(s)])} />
      <Select
        id="accident"
        label={F.accident}
        value={filters.accident ?? ""}
        options={[
          ["YES", "Sí"],
          ["NO", "No"],
        ]}
      />
      <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-7">
        <button type="submit" className={buttonPrimary}>
          {F.apply}
        </button>
        <a href="/admin" className={buttonSecondary}>
          {F.clear}
        </a>
      </div>
    </form>
  );
}

function Select({
  id,
  label,
  value,
  options,
  allValue = "",
  firstOptions = [],
}: {
  id: string;
  label: string;
  value: string;
  options: (readonly [string, string])[];
  allValue?: string;
  /** Opciones antes de "Todos" (p. ej. "Abiertos", el valor por defecto del filtro Estado). */
  firstOptions?: (readonly [string, string])[];
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} name={id} defaultValue={value} className={selectClass}>
        {firstOptions.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
        <option value={allValue}>{F.all}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Construye la query string de los filtros actuales (para paginación y exportación). */
export function filtersToQuery(filters: CaseListFilters, overrides: Partial<Record<string, string | number | undefined>> = {}): string {
  const p = new URLSearchParams();
  const entries: Record<string, string | number | undefined> = {
    q: filters.q,
    status: filters.status,
    priority: filters.priority,
    requestType: filters.requestType,
    verification: filters.verification,
    damage: filters.damage,
    accident: filters.accident,
    page: filters.page && filters.page > 1 ? filters.page : undefined,
    ...overrides,
  };
  for (const [k, v] of Object.entries(entries)) {
    if (v === undefined || v === "" || v === null) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
