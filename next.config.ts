import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // PGlite (WASM) y los SDK de servidor no deben empaquetarse con Turbopack/Webpack.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "nodemailer", "@aws-sdk/client-s3"],
  // En despliegues serverless (Vercel) las funciones solo incluyen lo que se traza desde el código.
  // Se agregan explícitamente las migraciones (PGlite las aplica al arrancar) y las fotos de modelos,
  // cuya existencia se comprueba con `fs` en la página de inicio.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**"],
    "/": ["./public/modelos/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
