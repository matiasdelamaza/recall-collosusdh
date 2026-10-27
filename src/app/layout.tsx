import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SEO } from "@/lib/copy/es";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://recallcollosusdh.cl";
const noindex = process.env.NEXT_PUBLIC_NOINDEX === "true";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: SEO.title, template: `%s | ${SEO.siteName}` },
  description: SEO.description,
  applicationName: SEO.siteName,
  alternates: { canonical: "/" },
  robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: siteUrl,
    siteName: SEO.siteName,
    title: SEO.title,
    description: SEO.description,
  },
  twitter: { card: "summary", title: SEO.title, description: SEO.description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className="min-h-dvh bg-paper text-ink">{children}</body>
    </html>
  );
}
