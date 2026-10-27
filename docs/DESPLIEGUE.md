# Despliegue a producción

Guía paso a paso para publicar `recallcollosusdh.cl`. El sitio puede publicarse **antes** de recibir la base de series de Polygon (modo interino, ver §7); lo que no debe hacerse es lanzar con datos de contacto inventados o sin revisión legal (ver `docs/PENDIENTES.md`).

## 1. Dominio y HTTPS

1. Registrar / apuntar `recallcollosusdh.cl` (NIC Chile) al proveedor elegido.
2. Configurar `www.recallcollosusdh.cl` → redirección 301 a `https://recallcollosusdh.cl`.
3. HTTPS obligatorio: certificado automático (Vercel/Cloudflare) o Let's Encrypt en servidor propio. Redirigir HTTP → HTTPS en el proveedor o en el proxy inverso. El sitio ya envía HSTS.
4. `NEXT_PUBLIC_SITE_URL=https://recallcollosusdh.cl` (se usa como canonical, en Open Graph y en los enlaces de los correos).

## 2. Opción A — Vercel + Supabase (recomendada por simplicidad)

### Estado actual (27-10-2026): proyecto Vercel ya creado y desplegado

| Dato | Valor |
|---|---|
| Proyecto Vercel | `recall-collosusdh` (`prj_eP0FynX0TOprJ5ifdhq571cqceEt`), equipo `cross-mountain` |
| Repositorio enlazado | `matiasdelamaza/recall-collosusdh`, rama de producción `main` (cada push despliega) |
| URL de producción | https://recall-collosusdh.vercel.app (también `recall-collosusdh-cross-mountain.vercel.app`) |
| Región de funciones | `gru1` (São Paulo), junto a la base Supabase |
| Protección | Vercel Authentication activa en las URLs `*.vercel.app` (solo miembros del equipo); el dominio propio quedará público al asignarlo |
| Base de datos actual | **Supabase (real, persistente)** vía pooler Supavisor `aws-1-sa-east-1.pooler.supabase.com` (puerto 6543 para la app, 5432 para migraciones), con el rol dedicado `recall_app` (sin privilegios de superusuario; acceso por políticas RLS explícitas). `ALLOW_PGLITE_IN_PRODUCTION=false` |
| Fotos | **Vercel Blob privado** (`STORAGE_PROVIDER=vercel-blob`, almacén `recall-collosusdh-fotos` en `gru1`, prefijo `recall/`). Sin URL pública; el panel las sirve por su ruta autenticada. Alternativa: `supabase` con `SUPABASE_SERVICE_ROLE_KEY` |
| Correo | `EMAIL_PROVIDER=console` (solo logs) |
| Panel interno | Activo: `ADMIN_PASSWORD` (visible en Vercel → Settings → Environment Variables; rotarla), `ADMIN_SESSION_SECRET` e `IP_HASH_SALT` cargados |
| Indexación | `NEXT_PUBLIC_NOINDEX=true` |

Variables ya cargadas en Vercel (Production y Preview): `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `ADMIN_SESSION_SECRET`, `IP_HASH_SALT` (sensibles), `ALLOW_PGLITE_IN_PRODUCTION=false`, `PGLITE_DATA_DIR`, `STORAGE_PROVIDER`, `LOCAL_STORAGE_DIR`, `EMAIL_PROVIDER`, `TRUSTED_PROXY`, `NEXT_PUBLIC_NOINDEX`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, `NEXT_PUBLIC_LAST_UPDATED`.

Comprobación rápida del almacenamiento: `GET /api/health?storage=1` escribe, lee y borra un objeto de prueba y devuelve `storage: {provider, ok}`.

Nota sobre el pooler: la conexión directa `db.<ref>.supabase.co` es solo IPv6 en el plan gratuito y Vercel no sale por IPv6, por eso se usa Supavisor. El host correcto para este proyecto es `aws-1-sa-east-1` (el `aws-0` responde "tenant/user not found"). El rol `recall_app` tiene `CREATE` sobre la base porque el migrador de Drizzle ejecuta `CREATE SCHEMA IF NOT EXISTS` en cada build; con `SKIP_DB_MIGRATIONS=true` ese paso se omite.


### Estado actual (27-10-2026): proyecto Supabase ya creado

| Dato | Valor |
|---|---|
| Proyecto Supabase | `recall-collosusdh` (ref `wljelbdpazhprpirbibd`), organización de matiasdelamaza |
| Región | `sa-east-1` (São Paulo) |
| URL del proyecto | `https://wljelbdpazhprpirbibd.supabase.co` |
| Esquema | aplicado (migración `0000_init` de Drizzle, registrada en `drizzle.__drizzle_migrations`) |
| RLS | activado en todas las tablas, sin políticas: la API REST (anon/authenticated) no puede leer datos; la app usa el rol `postgres` (bypass RLS) |
| Bucket de fotos | `recall-files`, privado, creado |

Para conectar este proyecto con Vercel sin copiar contraseñas: en Supabase, **Project Settings → Integrations → Vercel** → conectar al proyecto de Vercel `recall-collosusdh`. La integración sincroniza `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y el resto de variables en Vercel. Luego, en Vercel, añadir `STORAGE_PROVIDER=supabase`.

### Camino rápido: integración Supabase desde Vercel
1. Si el proyecto Supabase no existiera: en Vercel, **Storage → Create Database → Supabase** (o Marketplace → Supabase), región `sa-east-1` (São Paulo). Si ya existe (caso actual), usar la integración desde el lado de Supabase descrita arriba.
2. Vercel recibe automáticamente `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y otras. La aplicación las usa sin configuración adicional:
   - Base de datos: `POSTGRES_URL` para la app y `POSTGRES_URL_NON_POOLING` para las migraciones (si defines `DATABASE_URL`, esta tiene prioridad).
   - Migraciones: el script `vercel-build` las aplica en cada build (`tsx scripts/migrate.ts --if-configured && next build`); no hace falta ejecutarlas a mano.
   - Fotos: define `STORAGE_PROVIDER=supabase`. El bucket privado `recall-files` (o `SUPABASE_STORAGE_BUCKET`) se crea solo en la primera subida; no se necesitan claves S3.
3. TLS: Supabase usa una CA propia. Por defecto la conexión va cifrada sin verificar el certificado (lo que recomienda Supabase para node-postgres). Para verificarlo, descarga la CA en Supabase (Project Settings → Database → SSL) y ponla en `DATABASE_SSL_CA`.

### Camino manual: base de datos (Supabase)
1. Crear un proyecto en Supabase (región más cercana: `sa-east-1`, São Paulo).
2. Copiar la cadena de conexión **directa o con pooler en modo sesión** (Project Settings → Database). Usar la versión con `sslmode=require` como `DATABASE_URL`. La aplicación verifica el certificado TLS por defecto: descargar el certificado de CA de Supabase (Project Settings → Database → SSL) y entregarlo en `DATABASE_SSL_CA` (contenido PEM). Solo si no es posible, usar `DATABASE_SSL=no-verify` (TLS sin verificación de certificado), dejando constancia en el checklist.
3. Desactivar la exposición de tablas vía API REST (el portal no la usa) o dejar RLS activado sin políticas públicas.
4. Activar backups automáticos.

### Almacenamiento de fotos (Supabase Storage, S3-compatible)
1. Crear un bucket **privado** (p. ej. `recall-files`).
2. Generar credenciales S3 (Storage → Settings → S3 access keys).
3. Variables: `STORAGE_PROVIDER=s3`, `S3_BUCKET=recall-files`, `S3_ENDPOINT=https://<proyecto>.supabase.co/storage/v1/s3`, `S3_REGION=<región del proyecto>`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE=true`.

(Alternativas equivalentes: Cloudflare R2 o AWS S3 con bucket privado.)

### Aplicación (Vercel)
1. Importar el repositorio. Framework: Next.js. Node.js 22.
2. Definir todas las variables de entorno de `.env.example` en Production (y en Preview con `NEXT_PUBLIC_NOINDEX=true`).
3. Primer despliegue; luego ejecutar migraciones (ver §5).
4. Asignar el dominio.

> Nota sobre Vercel: las funciones son serverless y pueden ejecutarse en varias instancias; el rate limiting en memoria sigue siendo útil pero no es global. Ver §9.

## 3. Opción B — Servidor propio (Node + PostgreSQL)

1. Servidor Linux con Node.js 22, PostgreSQL 15+ y un proxy inverso (nginx/Caddy) con TLS.
2. Crear base y usuario: `CREATE DATABASE recall; CREATE USER recall WITH PASSWORD '…'; GRANT ALL ON DATABASE recall TO recall;`
3. `DATABASE_URL=postgresql://recall:…@localhost:5432/recall`
4. Fotos: `STORAGE_PROVIDER=local` y `LOCAL_STORAGE_DIR=/var/lib/recallcollosusdh/uploads` (carpeta fuera del árbol web, con permisos solo para el usuario del servicio y **respaldada**), o un bucket S3-compatible como en la opción A.
5. Build y arranque:
   ```bash
   npm ci
   npm run build
   npm run db:migrate
   npm run start            # puerto 3000; usar PM2 o systemd para mantenerlo activo
   ```
   Con PM2: `pm2 start npm --name recall -- start` y `pm2 save`.
6. Proxy inverso hacia `http://127.0.0.1:3000` con `client_max_body_size 45m` (nginx) para las fotos. **Nunca exponer el puerto 3000 directamente a internet**: la IP del cliente (límites de tasa, anti-enumeración y auditoría) se toma de las cabeceras del proxy según `TRUSTED_PROXY`:
   - nginx: `proxy_set_header X-Real-IP $remote_addr;` y `TRUSTED_PROXY=nginx`.
   - Caddy / balanceadores que añaden `X-Forwarded-For`: `TRUSTED_PROXY=standard` (se usa el último elemento, el que añade el proxy; el primero puede falsificarlo el cliente).
   - Cloudflare delante del servidor (todo el tráfico forzado por Cloudflare): `TRUSTED_PROXY=cloudflare`.
   En Vercel basta `TRUSTED_PROXY=standard` (valor por defecto).

Docker (opcional): imagen `node:22-alpine`, `npm ci && npm run build`, comando `npm run start`; montar un volumen para `LOCAL_STORAGE_DIR` si se usa almacenamiento local.

## 4. Variables obligatorias antes de lanzar

| Variable | Cómo obtenerla |
|---|---|
| `ADMIN_SESSION_SECRET` | `openssl rand -base64 48` |
| `ADMIN_PASSWORD` | Contraseña fuerte del panel interno (ver `docs/SEGURIDAD_Y_PRIVACIDAD.md`) |
| `IP_HASH_SALT` | `openssl rand -base64 48` (distinto del anterior) |
| `EMAIL_PROVIDER` + credenciales | `resend` (`RESEND_API_KEY`, dominio verificado) o `smtp` (`SMTP_*`). Nunca `console` en producción |
| `EMAIL_FROM` | Remitente con dominio verificado (SPF/DKIM/DMARC) |
| `INTERNAL_NOTIFICATION_EMAILS` | Correos del equipo de Postventa `[POR DEFINIR]` |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTACT_WHATSAPP`, `NEXT_PUBLIC_CONTACT_HOURS` | Canales públicos `[POR DEFINIR]`. Mientras estén vacíos el sitio muestra "[POR DEFINIR]" |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Opcional. Cloudflare Dashboard → Turnstile → crear widget para `recallcollosusdh.cl` (modo "Managed") |
| `ANALYTICS_PROVIDER` | `internal` (recomendado) o `none` |

## 5. Migraciones en producción

```bash
DATABASE_URL="postgresql://…" npm run db:migrate
```
Ejecutar tras cada despliegue que incluya una migración nueva en `./drizzle`. Para crear una migración tras cambiar `src/db/schema.ts`: `npm run db:generate`, revisar el SQL y commitear.

## 6. Importar la base oficial de series de Polygon

Formato CSV esperado (UTF-8, con o sin BOM, separador `,` o `;`, primera fila de cabeceras):

```csv
serial_number,model,size,production_batch,status
<serie>,Collosus DH7,M,<lote>,RECALL
```

- `serial_number` es obligatoria (se aceptan los alias `serial`, `frame_number`, `serie`, `numero_de_serie`).
- `model`, `size`, `production_batch` son opcionales pero recomendables.
- `status` opcional: `RECALL` (por defecto) o `EXCLUDED`.
- Las series se normalizan (mayúsculas, sin espacios). Las filas inválidas se omiten y se informan.

Validar primero sin escribir, luego importar:

```bash
DATABASE_URL="postgresql://…" npm run serials:import -- /ruta/polygon_collosus_dh.csv --dry-run
DATABASE_URL="postgresql://…" npm run serials:import -- /ruta/polygon_collosus_dh.csv --by="nombre.apellido"
```

También puede subirse el CSV desde `/admin/series` (con la casilla "Solo validar" para un ensayo). Repetir la importación es seguro: las series existentes se actualizan, no se duplican.

## 7. Modo interino → modo completo

1. Mientras la base no esté cargada, el ajuste `serial_database_status` queda en `PENDING`: el sitio funciona, acepta registros y nunca responde "no aparece".
2. Importar la base (§6) y contrastar el total de series con lo informado por Polygon.
3. En `/admin/series`, marcar la base como **COMPLETE** (desde ese momento, las series sin coincidencia reciben "no aparece actualmente…").
4. En `/admin/series`, ejecutar **Reprocesar casos pendientes** (primero en modo "simular", luego con "notificar a clientes") para informar a quienes se registraron durante el modo interino. Equivalente por CLI: `npm run cases:reprocess -- --dry-run` y después `npm run cases:reprocess -- --notify`.

## 8. Indexación (staging vs. producción)

- Staging / vistas previas: `NEXT_PUBLIC_NOINDEX=true` (robots `noindex`, `robots.txt` bloquea todo).
- Producción oficial: `NEXT_PUBLIC_NOINDEX=false`. `robots.txt` permite el sitio y bloquea `/admin`, `/api` y `/dev`. El canonical usa `NEXT_PUBLIC_SITE_URL`.

## 9. Rate limiting en memoria

`src/lib/server/rate-limit.ts` guarda los contadores en memoria del proceso. Es adecuado para una instancia (opción B) y aceptable como primera línea en Vercel. Para un límite global en despliegues con varias instancias/regiones, implementar la misma interfaz (`checkRateLimit(bucket, key, rule)`) sobre Redis (p. ej. Upstash con `INCR` + `EXPIRE` o un sorted set por ventana) y sustituir la importación; el resto del código no cambia. Cloudflare Turnstile y el rate limiting del propio proveedor (Cloudflare WAF / Vercel Firewall) complementan este control.

## 10. Checklist pre-lanzamiento

- [ ] `npm run typecheck`, `npm test`, `npm run audit:copy` y `npm run build` en verde (CI).
- [ ] Dominio con HTTPS y redirecciones HTTP→HTTPS y `www`→raíz.
- [ ] `DATABASE_URL` de producción, migraciones aplicadas, backups activos.
- [ ] Bucket de fotos **privado** y credenciales mínimas (o carpeta local respaldada).
- [ ] Correo transaccional real configurado y probado (recibir una confirmación de cliente y una alerta interna en un registro de prueba; luego borrar el caso de prueba o marcarlo `CLOSED` con nota).
- [ ] `INTERNAL_NOTIFICATION_EMAILS` con el equipo de Postventa.
- [ ] Contactos públicos (`NEXT_PUBLIC_CONTACT_*`) definidos por Cross Mountain — sin ellos el sitio muestra "[POR DEFINIR]".
- [ ] Aviso de privacidad (`PRIVACY` en `src/lib/copy/es.ts`) revisado legalmente y sin marcas `[POR DEFINIR]`.
- [ ] Textos pendientes de Polygon confirmados (terminología del cuadro de reemplazo, modelos/tallas afectados) — ver `docs/PENDIENTES.md`.
- [ ] Logos oficiales de Polygon y Cross Mountain en `public/` (los actuales son marcas tipográficas provisionales).
- [ ] `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `IP_HASH_SALT` únicos y guardados en el gestor de secretos.
- [ ] `NEXT_PUBLIC_NOINDEX=false` y `robots.txt` verificado en `https://recallcollosusdh.cl/robots.txt`.
- [ ] Prueba completa en móvil real: verificar serie → registrar con fotos → recibir correo → ver el caso en `/admin`.
- [ ] Base de Polygon: importada y marcada `COMPLETE` **o** sitio en modo interino con el aviso visible en la portada.
- [ ] Procedimiento de notificación del recall revisado conforme a los requisitos de SERNAC (brief §40).

## Integración continua (GitHub Actions)

El workflow de CI (typecheck, pruebas, auditoría de idioma y build) está en `.github/ci.yml.example`. Para activarlo, muévelo a `.github/workflows/ci.yml` desde tu propio equipo o desde la interfaz de GitHub:

```bash
mkdir -p .github/workflows && git mv .github/ci.yml.example .github/workflows/ci.yml && git commit -m "CI: activar workflow" && git push
```

(Se entrega como ejemplo porque la credencial automatizada que subió el repositorio no tiene permiso para crear workflows.)
