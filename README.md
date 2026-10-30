# Recall de Seguridad Polygon Collosus DH — Chile

Portal oficial de verificación de número de serie y registro de propietarios para la campaña de recall de seguridad de determinadas bicicletas **Polygon Collosus DH** en Chile, operado por **Cross Mountain SpA** (distribuidor Polygon Bikes en Chile) junto a **Polygon Bikes**.

Dominio: `recallcollosusdh.cl`

> Este sitio **no** es una tienda, una campaña de marketing ni un portal de garantías. Es un portal de seguridad: el propietario ingresa su número de serie, sabe de inmediato qué debe hacer y, si su unidad está incluida, registra su bicicleta para iniciar el reemplazo del cuadro.

## Principios

1. **Seguridad del rider primero.** La instrucción "NO UTILICES LA BICICLETA" es inequívoca para unidades afectadas y se recomienda suspender el uso mientras no exista confirmación.
2. **100 % en español.** Todo texto visible al usuario final vive en `src/lib/copy/es.ts` (público) y `src/lib/copy/es-admin.ts` (panel interno). `npm run audit:copy` falla si aparece terminología en inglés prohibida por el brief.
3. **Sin inventar datos.** Contactos, plazos, terminología técnica y textos legales pendientes se mantienen como `[POR DEFINIR]` hasta que Cross Mountain o Polygon los confirmen. Ver [docs/PENDIENTES.md](docs/PENDIENTES.md).
4. **Nunca certificar seguridad.** Un número de serie que no aparece en la base se comunica como "no aparece actualmente", nunca como "tu bicicleta es segura".
5. **La base de series afectadas es confidencial.** Se consulta solo en el servidor por coincidencia exacta; nunca se expone al cliente ni se puede descargar.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Estilos | Tailwind CSS 4 (tokens en `src/app/globals.css`) |
| Base de datos | Drizzle ORM. Producción: PostgreSQL / Supabase (`DATABASE_URL`). Desarrollo: PGlite (PostgreSQL embebido en `./.data/pglite`, sin instalar nada) |
| Archivos subidos | Disco local (`local`) o cualquier almacenamiento S3-compatible (`s3`: AWS S3, Cloudflare R2, Supabase Storage) |
| Correo transaccional | `console` (desarrollo), Resend o SMTP (nodemailer) |
| Anti-enumeración | Rate limiting por IP hasheada + Cloudflare Turnstile opcional |
| Pruebas | Vitest |

## Estructura de carpetas

```
src/
  app/
    page.tsx                 Portada: verificador, resultado, registro, secciones informativas
    privacidad/              Aviso de privacidad
    dev/estados/             QA visual de todos los estados (solo desarrollo)
    api/verificar            POST — verificación de número de serie (server-side)
    api/registro             POST — registro de propietario (multipart, con fotos)
    api/analytics            POST — eventos de analítica sin datos personales
    admin/                   Panel interno de Postventa (casos, métricas, base de series)
    api/admin/               Archivos adjuntos y exportaciones CSV (autenticados)
  components/public/         Componentes de la interfaz pública
  components/admin/          Componentes del panel interno
  db/schema.ts               Esquema Drizzle (tablas, enums, estados)
  db/client.ts               Conexión (pg o PGlite) con migración automática en desarrollo
  lib/copy/es.ts             TODO el texto público en español
  lib/copy/es-admin.ts       Texto del panel interno
  lib/recall/verify.ts       Lógica de verificación (coincidencia exacta, modo interino)
  lib/recall/register.ts     Creación de casos, duplicados, archivos
  lib/recall/import.ts       Importación de la base oficial de series (CSV)
  lib/recall/reprocess.ts    Reproceso de casos pendientes al cargar la base
  lib/email/                 Proveedores y plantillas de correo
  lib/storage/               Proveedores de almacenamiento de archivos
  lib/server/                Rate limit, auditoría, utilidades de request
  proxy.ts                   Protección de rutas /admin
drizzle/                     Migraciones SQL generadas
scripts/                     Migración, importación de series, seed, reproceso, auditoría de idioma
tests/                       unit/ (módulos puros), backend/ (API con PGlite), admin/
docs/                        Arquitectura, despliegue, operación, pendientes, seguridad
```

## Correr en local

Requisitos: Node.js ≥ 20.9 (recomendado 22) y npm.

```bash
npm install
cp .env.example .env         # en desarrollo puedes dejar DATABASE_URL vacío (usa PGlite)
npm run db:migrate           # crea las tablas en ./.data/pglite
npm run db:seed:dev          # carga series ficticias DEMO-AFECTADA-0001 … 0005 (nunca en producción)
npm run dev                  # http://localhost:3000
```

Para entrar al panel interno (`/admin`) define en `.env` al menos `ADMIN_PASSWORD` (≥ 8 caracteres) y `ADMIN_SESSION_SECRET` (≥ 32 caracteres; `openssl rand -base64 48`).

Prueba rápida del flujo: en la portada ingresa `DEMO-AFECTADA-0001` → debe aparecer el estado rojo "Tu bicicleta está incluida en este recall". Cualquier otra serie válida devolverá "pendiente de verificación" mientras la base esté en modo interino (ver abajo).

## Scripts npm

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Todas las pruebas (Vitest) |
| `npm run test:watch` | Pruebas en modo observación |
| `npm run db:generate` | Genera una migración SQL a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones de `./drizzle` (PostgreSQL si hay `DATABASE_URL`, si no PGlite) |
| `npm run db:seed:dev` | Series ficticias de desarrollo (se niega a correr en producción) |
| `npm run serials:import -- ruta.csv [--dry-run] [--by=nombre]` | Importa la base oficial de series afectadas de Polygon |
| `npm run cases:reprocess -- [--notify] [--dry-run]` | Reprocesa casos pendientes contra la base cargada |
| `npm run audit:copy` | Auditoría de idioma (falla si hay términos en inglés prohibidos en la interfaz) |

## Modo interino vs. modo completo

La base de series afectadas la entrega Polygon y puede llegar después de publicar el sitio. El ajuste `serial_database_status` (tabla `settings`, editable en `/admin/series`) controla el comportamiento:

| Estado | Serie coincide | Serie no coincide |
|---|---|---|
| `PENDING` (interino, valor por defecto) | **Unidad afectada** (rojo) | **Pendiente de verificación**: se registra la bicicleta y se recomienda no utilizarla hasta recibir confirmación |
| `COMPLETE` (base oficial cargada y validada) | **Unidad afectada** (rojo) | **No aparece actualmente** entre las unidades incluidas (nunca "es segura") + opción de solicitar revisión |

Flujo al recibir la base: `npm run serials:import` (o subir el CSV en `/admin/series`) → revisar conteos → marcar `COMPLETE` en `/admin/series` → "Reprocesar casos pendientes" para notificar a quienes se registraron durante el modo interino. Detalle en [docs/OPERACION.md](docs/OPERACION.md).

## Variables de entorno

Copia `.env.example` a `.env`. Ninguna variable con datos de contacto debe inventarse.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Sí (prod) | URL pública canónica (`https://recallcollosusdh.cl`). Se usa en metadatos y enlaces de correo. |
| `DATABASE_URL` | Sí (prod) | Cadena de conexión PostgreSQL / Supabase. Vacía en desarrollo → PGlite. |
| `PGLITE_DATA_DIR` | No | Carpeta de datos de PGlite (por defecto `./.data/pglite`). |
| `ALLOW_PGLITE_IN_PRODUCTION` | No | Solo para pruebas; nunca en producción real. |
| `ADMIN_SESSION_SECRET` | Sí | Secreto (≥ 32 caracteres) que firma la cookie de sesión del panel interno. |
| `ADMIN_PASSWORD` | Sí | Contraseña del panel interno. Fuerte y rotada periódicamente. |
| `IP_HASH_SALT` | Sí (prod) | Sal para hashear IPs en registros de auditoría y rate limit (no se guardan IPs en claro). |
| `EMAIL_PROVIDER` | Sí | `console` (imprime en consola), `resend` o `smtp`. |
| `EMAIL_FROM` | Sí | Remitente de los correos. |
| `INTERNAL_NOTIFICATION_EMAILS` | Sí (prod) | Correos de Postventa que reciben la alerta de cada caso, separados por coma. `[POR DEFINIR]` |
| `BROADCAST_TEST_EMAILS` | No | Correos que reciben la prueba de un comunicado (Comunicaciones), separados por coma. Vacío: se usan los internos. |
| `RESEND_API_KEY` | Si `resend` | Clave de API de Resend. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Si `smtp` | Credenciales SMTP. |
| `STORAGE_PROVIDER` | Sí | `local` (disco) o `s3`. |
| `LOCAL_STORAGE_DIR` | Si `local` | Carpeta de archivos subidos (por defecto `./.data/uploads`). |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | Si `s3` | Bucket privado S3-compatible (AWS, R2, Supabase Storage). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile; si se definen, se exige tras actividad sospechosa de enumeración. |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTACT_WHATSAPP`, `NEXT_PUBLIC_CONTACT_HOURS` | Sí (antes de lanzar) | Canales públicos de Postventa. Mientras estén vacíos el sitio muestra `[POR DEFINIR]`. |
| `ANALYTICS_PROVIDER` | No | `internal` (solo nombre de evento + fecha en la base) o `none`. |
| `NEXT_PUBLIC_NOINDEX` | No | `true` en staging (bloquea indexación), `false` al lanzar. |

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — flujo, modelo de datos, estados, contratos de API, decisiones de seguridad.
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) — puesta en producción paso a paso y checklist de lanzamiento.
- [docs/OPERACION.md](docs/OPERACION.md) — runbook para el equipo de Postventa.
- [docs/PENDIENTES.md](docs/PENDIENTES.md) — ítems que Polygon y Cross Mountain deben confirmar antes del lanzamiento.
- [docs/SEGURIDAD_Y_PRIVACIDAD.md](docs/SEGURIDAD_Y_PRIVACIDAD.md) — controles implementados y tratamiento de datos personales.

## Pruebas y calidad

```bash
npm run typecheck
npm test
npm run audit:copy
```

La integración continua (`.github/workflows/ci.yml`) ejecuta typecheck, pruebas, auditoría de idioma y build en cada push y pull request.
