import { redirect } from "next/navigation";
import { loginAction } from "@/lib/admin/auth";
import { isAdminConfigured, verifySession } from "@/lib/admin/session";
import { ADMIN } from "@/lib/copy/es-admin";
import { buttonPrimary, inputClass, labelClass } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const pick = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const configured = isAdminConfigured();

  if (configured) {
    const session = await verifySession();
    if (session) redirect("/admin");
  }

  const error = pick("error");
  const next = pick("next").startsWith("/admin") ? pick("next") : "/admin";

  return (
    <div className="mx-auto mt-6 max-w-sm">
      <div className="rounded-md border border-line bg-paper p-6">
        <h1 className="headline text-xl">{ADMIN.login.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{ADMIN.login.intro}</p>

        {!configured ? (
          <p role="alert" className="mt-4 rounded-md border border-alert bg-alert-50 px-3 py-2 text-sm text-alert-700">
            {ADMIN.login.notConfigured}
          </p>
        ) : (
          <form action={loginAction} className="mt-5 grid gap-3">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="password" className={labelClass}>
                {ADMIN.login.password}
              </label>
              <input id="password" name="password" type="password" required autoComplete="current-password" maxLength={256} className={inputClass} autoFocus />
            </div>
            {error === "invalid" ? (
              <p role="alert" className="text-sm font-semibold text-alert-700">
                {ADMIN.login.invalid}
              </p>
            ) : null}
            {error === "rate" ? (
              <p role="alert" className="text-sm font-semibold text-alert-700">
                {ADMIN.login.rateLimited}
              </p>
            ) : null}
            {pick("expired") ? <p className="text-sm text-ink-500">{ADMIN.login.sessionExpired}</p> : null}
            <button type="submit" className={buttonPrimary}>
              {ADMIN.login.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
