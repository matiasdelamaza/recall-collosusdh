import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/lib/admin/auth";
import { isAdminConfigured, verifySession } from "@/lib/admin/session";
import { ADMIN } from "@/lib/copy/es-admin";
import { getInboxCounts } from "@/lib/recall/mailbox";

export const metadata: Metadata = {
  title: { absolute: ADMIN.appTitle },
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // La navegación (y el botón de cerrar sesión) solo se muestra con sesión válida.
  // La autorización real se exige en cada página/acción con requireAdmin().
  const authenticated = isAdminConfigured() && (await verifySession()) !== null;
  // Correos sin atender en la navegación (si falla la consulta, la navegación sigue funcionando).
  const pending = authenticated ? await getInboxCounts().then((c) => c.pending, () => 0) : 0;
  return (
    <div className="min-h-dvh bg-paper-100 text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="text-sm font-extrabold uppercase tracking-wider">
            {ADMIN.brand}
          </Link>
          {authenticated ? (
            <nav aria-label="Panel interno" className="flex flex-wrap items-center gap-1 text-sm">
              <NavLink href="/admin/mesa">{ADMIN.nav.mesa}</NavLink>
              <NavLink href="/admin/bandeja">
                {ADMIN.nav.inbox}
                {pending > 0 ? <span className="ml-1.5 rounded-sm bg-alert px-1.5 py-0.5 text-[11px] font-bold text-paper tabular-nums">{pending}</span> : null}
              </NavLink>
              <NavLink href="/admin">{ADMIN.nav.cases}</NavLink>
              <NavLink href="/admin/metricas">{ADMIN.nav.metrics}</NavLink>
              <NavLink href="/admin/consultas">{ADMIN.nav.lookups}</NavLink>
              <NavLink href="/admin/series">{ADMIN.nav.serials}</NavLink>
              <NavLink href="/admin/comunicaciones">{ADMIN.nav.comms}</NavLink>
              <form action={logoutAction}>
                <button type="submit" className="rounded-sm px-3 py-1.5 font-semibold text-ink-500 hover:bg-paper-100 hover:text-ink">
                  {ADMIN.nav.logout}
                </button>
              </form>
            </nav>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-sm px-3 py-1.5 font-semibold hover:bg-paper-100">
      {children}
    </Link>
  );
}
