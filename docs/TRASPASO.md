# Traspaso de trabajo — recallcollosusdh (27-10-2026)

Documento para retomar el proyecto desde otra cuenta/equipo sin perder nada.
Las contraseñas y claves NO están aquí: viven en Vercel (Settings → Environment Variables).

## 1. Dónde está cada cosa

| Componente | Dónde | Identificador |
|---|---|---|
| Código fuente | GitHub | `matiasdelamaza/recall-collosusdh`, rama `main` (cada push a `main` despliega a producción) |
| Hosting | Vercel, equipo `cross-mountain` | proyecto `recall-collosusdh` (`prj_eP0FynX0TOprJ5ifdhq571cqceEt`), funciones en `gru1` (São Paulo) |
| URL de producción | Vercel | https://recall-collosusdh.vercel.app (protegida con inicio de sesión de Vercel hasta que se asigne el dominio) |
| Base de datos | Supabase, organización de matiasdelamaza | proyecto `recall-collosusdh` (ref `wljelbdpazhprpirbibd`), São Paulo |
| Fotos | Vercel Blob privado | almacén `recall-collosusdh-fotos` (`store_ROu6HYBteVBITwcG`), enlazado al proyecto |
| Panel interno | https://recall-collosusdh.vercel.app/admin | contraseña = variable `ADMIN_PASSWORD` en Vercel |

Estado de la campaña en la base: **modo interino** (`serial_database_status = PENDING`), cero series afectadas reales. Dos casos de prueba (`RCDH-RZ73V`, `RCDH-BG5H9`, cliente "Prueba Interna…") quedaron para inspección; eliminarlos antes del lanzamiento.

## 2. Variables de entorno en Vercel (Production y Preview)

Cargadas: `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `IP_HASH_SALT`,
`BLOB_READ_WRITE_TOKEN` (la inyecta el almacén Blob), `STORAGE_PROVIDER=vercel-blob`, `VERCEL_BLOB_PREFIX=recall`,
`EMAIL_PROVIDER=console`, `TRUSTED_PROXY=standard`, `NEXT_PUBLIC_NOINDEX=true`, `NEXT_PUBLIC_SITE_URL`,
`SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, `NEXT_PUBLIC_LAST_UPDATED`, `ALLOW_PGLITE_IN_PRODUCTION=false`,
`PGLITE_DATA_DIR`, `LOCAL_STORAGE_DIR`, `NEXT_TELEMETRY_DISABLED`.

Detalles técnicos de la conexión: la app entra a Supabase con el rol dedicado `recall_app` (no `postgres`) a través del pooler
`aws-1-sa-east-1.pooler.supabase.com` (6543 app / 5432 migraciones). Las tablas tienen RLS con políticas solo para `recall_app`.
El secreto de "bypass" de Vercel usado en las pruebas fue revocado.

## 3. Paso a paso para empezar mañana en el Mac mini (cuenta team)

1. **Acceso a los servicios con la nueva cuenta** (si la cuenta team es distinta a la personal):
   - GitHub: añadir al usuario/cuenta como colaborador del repositorio `matiasdelamaza/recall-collosusdh` (o transferirlo a la organización `crossmountain`; Vercel se re-enlaza en Settings → Git).
   - Vercel: el proyecto ya está en el equipo `cross-mountain`; basta ser miembro del equipo.
   - Supabase: invitar a la nueva cuenta a la organización desde Supabase → Organization → Team (o seguir usando la actual).
2. **Conectores en claude.ai** (menú de conectores): conectar GitHub (instalar la app de Claude en el repositorio), Vercel
   (en la pantalla de consentimiento elegir el equipo **cross-mountain**) y Supabase (elegir la organización correcta).
3. **Sesión nueva de Claude Code** con el repositorio `matiasdelamaza/recall-collosusdh` seleccionado como fuente. Primer mensaje sugerido:
   > "Lee docs/TRASPASO.md y docs/PENDIENTES.md y continúa desde ahí."
   La extensión de Chrome de Claude funciona con sesiones locales (Claude Code en el Mac / app de escritorio), no con sesiones en la nube.
4. **Entorno local** (opcional, para probar sin tocar producción):
   ```bash
   git clone https://github.com/matiasdelamaza/recall-collosusdh.git && cd recall-collosusdh
   npm install && cp .env.example .env && npm run db:migrate && npm run db:seed:dev && npm run dev
   ```
   Con `.env` vacío se usa una base local (PGlite) y series de demostración `DEMO-AFECTADA-0001…0005`.

## 4. Cuando llegue la base de series de Polygon

1. Convertir a CSV con una columna `serial_number` (opcionales: `model`, `size`, `production_batch`, `status`). Separador `,` o `;`.
2. Importar: en el panel `/admin/series` (subir archivo; primero con "Solo validar") o por consola con `DATABASE_URL` apuntando a Supabase:
   `npm run serials:import -- archivo.csv --dry-run` y luego sin `--dry-run`.
3. En `/admin/series`, pulsar **"Marcar base como CARGADA Y VALIDADA"**. Desde ese momento: serie afectada → formulario de reemplazo;
   serie no listada → "no aparece dentro de las unidades incluidas" (sin botón de revisión).
4. Pulsar **"Reprocesar casos pendientes"** con "Notificar" marcado: los registros del modo interino se reclasifican y reciben su correo.
   Antes de eso, configurar el correo real (paso 5), o los correos solo quedarán en los logs.

## 5. Pendientes antes del lanzamiento público

- Correo transaccional: `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (o SMTP), `EMAIL_FROM`, `INTERNAL_NOTIFICATION_EMAILS`.
- Contacto de Postventa: `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTACT_WHATSAPP`, `NEXT_PUBLIC_CONTACT_HOURS`.
- Dominio `recallcollosusdh.cl` en Vercel (Settings → Domains); luego `NEXT_PUBLIC_SITE_URL=https://recallcollosusdh.cl` y `NEXT_PUBLIC_NOINDEX=false`.
  El dominio propio queda público automáticamente; las URLs `*.vercel.app` siguen protegidas.
- Cambiar `ADMIN_PASSWORD` por una propia; borrar los dos casos de prueba; copiar las fotos oficiales a `public/modelos/collosus-dh7.jpg` y `collosus-dh9.jpg`.
- Revisión legal del aviso de privacidad (`PRIVACY` en `src/lib/copy/es.ts`) y validación del proceso con SERNAC.
- Activar CI: mover `.github/ci.yml.example` a `.github/workflows/ci.yml`.

## 6. Documentación relacionada

`README.md`, `docs/ARQUITECTURA.md`, `docs/DESPLIEGUE.md`, `docs/OPERACION.md` (runbook de Postventa), `docs/PENDIENTES.md`, `docs/SEGURIDAD_Y_PRIVACIDAD.md`.

Sesión de Claude Code en la que se construyó: https://claude.ai/code/session_019KbavWRyRdpimCkaRm6EEf
