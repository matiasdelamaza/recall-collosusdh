/**
 * Proxy (Next 16; reemplaza a middleware.ts).
 * Chequeo barato para /admin/*: sin cookie de sesión → redirige al login.
 * La validez de la firma se verifica en `requireAdmin()` dentro de cada página/acción.
 */
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "rcdh_admin";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    const next = `${pathname}${search}`;
    if (next.startsWith("/admin") && next.length < 512) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
