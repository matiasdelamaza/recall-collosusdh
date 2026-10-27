# Arquitectura — Portal de recall Polygon Collosus DH (Chile)

## 1. Vista general

```
                         ┌──────────────────────────────────────────────┐
                         │               recallcollosusdh.cl             │
                         │           Next.js 16 (App Router)             │
                         └──────────────────────────────────────────────┘
  Propietario (móvil)                        │
  ───────────────────►  /  (portada)         │
       │  ingresa serie                      │
       ▼                                     ▼
  POST /api/verificar ──► src/lib/recall/verify.ts ──► affected_serials (coincidencia EXACTA)
       │                        │                         settings.serial_database_status
       │                        └─► serial_lookups (registro de consulta, IP hasheada)
       ▼
  Resultado: AFFECTED | NOT_IDENTIFIED | PENDING_DATABASE | UNVERIFIED
       │  abre formulario
       ▼
  POST /api/registro (multipart) ──► src/lib/recall/register.ts
       │     ├─ re-verifica la serie en el servidor (nunca confía en el cliente)
       │     ├─ valida campos (zod) y archivos (magic bytes, tamaño, cantidad)
       │     ├─ detecta duplicados por serie + identidad
       │     ├─ transacción: recall_cases + case_files + audit_events
       │     ├─ storage (local | S3-compatible)  ← fotos
       │     └─ email (console | Resend | SMTP)  → cliente + Postventa interna
       ▼
  Respuesta: CREATED (RCDH-XXXXX) | EXISTING | errores en español

  Postventa (Cross Mountain)
  ───────────────────►  /admin (cookie firmada HMAC, proxy.ts + requireAdmin)
                         ├─ casos: lista, filtros, detalle, estado, notas, asignación, cuadro de reemplazo
                         ├─ métricas (§31 del brief)
                         ├─ base de series: importar CSV, PENDING ↔ COMPLETE, reprocesar pendientes
                         └─ /api/admin/archivos/[id], /api/admin/exportar/*.csv

  Scripts (CLI): db:migrate · serials:import · cases:reprocess · db:seed:dev · audit:copy
```

## 2. Modelo de datos (`src/db/schema.ts`)

Dialecto PostgreSQL vía Drizzle ORM. Idéntico en producción (PostgreSQL/Supabase) y desarrollo (PGlite).

| Tabla | Propósito |
|---|---|
| `affected_serials` | Base **oficial** de series afectadas entregada por Polygon. `serial_number` normalizado (clave única), `serial_raw`, modelo, talla, lote de producción, `status` (`RECALL`). Solo se consulta en el servidor. |
| `serial_imports` | Historial de importaciones de la base (archivo, filas, insertadas/actualizadas/omitidas, quién, notas). |
| `recall_cases` | Un caso por solicitud de propietario: datos del cliente, bicicleta, estado de verificación, tipo de solicitud, prioridad, estado operativo, incidente (daño/accidente/descripción), cuadro de reemplazo, asignación, trazas (IP hasheada, user agent), fechas. `case_id` público `RCDH-XXXXX`. |
| `case_files` | Fotos adjuntas al caso (clave privada de almacenamiento, nombre original saneado, MIME, tamaño). No existen URLs públicas. |
| `case_notes` | Notas internas de Postventa. |
| `audit_events` | Bitácora: creación de casos, cambios de estado, correos, importaciones, accesos admin, exportaciones, actividad sospechosa. |
| `serial_lookups` | Cada consulta de serie (serie normalizada, resultado, IP hasheada, user agent). Alimenta métricas y la detección de enumeración. |
| `analytics_events` | Eventos de analítica interna: **solo nombre y fecha**. Nunca datos personales. |
| `settings` | Configuración operativa clave/valor. Clave principal: `serial_database_status` (`PENDING` \| `COMPLETE`). |

## 3. Estados de verificación (`serial_verification_status`)

| Estado | Significado | Texto público |
|---|---|---|
| `AFFECTED` | Coincidencia exacta con la base oficial y `status = RECALL`. | "Tu bicicleta está incluida en este recall — NO UTILICES LA BICICLETA" (rojo). |
| `NOT_IDENTIFIED` | Serie válida sin coincidencia **y** base marcada `COMPLETE`. | "Tu número de serie no aparece actualmente…" + "esto no constituye una inspección técnica…". Nunca "es segura". |
| `PENDING_DATABASE` | Serie válida sin coincidencia **y** base `PENDING` (modo interino). | "Pendiente de verificación: registra tu bicicleta… recomendamos suspender el uso". |
| `UNVERIFIED` | Formato inválido (vacía, corta, larga, caracteres no permitidos). | "No pudimos verificar tu número de serie" + revisión manual. |

Regla central (`decideNonMatch` en `src/lib/recall/verify.ts`): mientras la base no esté `COMPLETE`, **nunca** se entrega un resultado "no identificada".

## 4. Tipos de solicitud y prioridad

| `request_type` | Origen | `case_status` inicial |
|---|---|---|
| `REPLACEMENT` | Serie `AFFECTED` | `REGISTERED` |
| `MANUAL_REVIEW` | `NOT_IDENTIFIED` o `UNVERIFIED` | `MANUAL_REVIEW` |
| `PENDING_DATABASE` | Modo interino | `REGISTERED` (pasa por reproceso al cargar la base) |

`priority = HIGH` cuando el propietario declara un accidente (`accident_reported = true`). El correo interno se marca `[ALTA PRIORIDAD]`.

El servidor deriva el tipo de solicitud a partir de **su propia** verificación (`requestTypeForState` en `src/lib/types.ts`); el valor enviado por el cliente no prevalece.

## 5. Máquina de estados del caso (`case_status`)

Flujo principal (recomendado en este orden; el panel permite cualquier transición, siempre auditada):

| Estado | Significado | Cuándo usarlo |
|---|---|---|
| `REGISTERED` | Registrado | Caso recién creado desde el sitio. |
| `VALIDATED` | Validado | Postventa revisó fotos y datos; la serie y la identidad son consistentes. |
| `CUSTOMER_CONTACTED` | Cliente contactado | Primer contacto efectivo (correo, WhatsApp o teléfono). |
| `REPLACEMENT_FRAME_ASSIGNED` | Cuadro de reemplazo asignado | Se asignó una unidad de nueva versión (registrar serie y versión del cuadro). |
| `FRAME_IN_TRANSIT` | Cuadro en tránsito | Polygon despachó / el cuadro viaja a Chile o al punto de servicio. |
| `FRAME_RECEIVED` | Cuadro recibido | El cuadro está físicamente disponible. |
| `SERVICE_SCHEDULED` | Servicio agendado | Hay fecha para el traspaso de componentes. |
| `REPLACED` | Reemplazado | El cuadro fue cambiado y la bicicleta entregada. Marca `closed_at`. |
| `CLOSED` | Cerrado | Caso terminado (reemplazado o resuelto de otra forma). Marca `closed_at`. |

Estados de excepción:

| Estado | Significado |
|---|---|
| `MANUAL_REVIEW` | Requiere revisión humana (serie no identificada / no verificable / reproceso sin coincidencia). |
| `INVALID_SERIAL` | Postventa determinó que la serie es incorrecta o no corresponde a una Collosus DH. |
| `DUPLICATE_CASE` | Otra persona ya tiene un caso activo para la misma serie; revisar identidad. |
| `CUSTOMER_UNREACHABLE` | No fue posible contactar al cliente tras varios intentos. |

"Activos" para control de duplicados: todos salvo `REPLACED`, `CLOSED` e `INVALID_SERIAL` (ver `ACTIVE_CASE_STATUSES`).

## 6. Contratos de API (`src/lib/types.ts`)

### `POST /api/verificar`
Entrada JSON: `{ serial: string, turnstileToken?: string }`.
Salida (`VerifyResponse`): `{ ok: true, state: "AFFECTED", serial, model?, size? }` · `{ ok: true, state: "NOT_IDENTIFIED" | "PENDING_DATABASE", serial }` · `{ ok: true, state: "UNVERIFIED", serial, reason }` · `{ ok: false, error: "RATE_LIMITED" | "TURNSTILE_REQUIRED" | "TURNSTILE_FAILED" | "INVALID_REQUEST" | "SERVER_ERROR", message }`. Siempre `Cache-Control: no-store`.

### `POST /api/registro` (multipart/form-data)
Campos de texto: `RegistrationFields` (serie, tipo de solicitud, datos del propietario, bicicleta, daño/accidente, descripción, confirmaciones, honeypot `website`).
Archivos: `serialPhoto` (1, obligatorio), `bikePhoto` (1, obligatorio), `headtubePhoto` (0–1), `additionalPhotos` (0–n), `incidentFiles` (0–n).
Salida (`RegistrationResponse`): `{ ok: true, outcome: "CREATED" | "EXISTING", caseId, serial, verification, requestType }` · `{ ok: false, error: "VALIDATION", message, fields }` · `{ ok: false, error: "RATE_LIMITED" | "DUPLICATE_LIMIT" | "TOO_LARGE" | "INVALID_REQUEST" | "SERVER_ERROR", message }`.

### `POST /api/analytics`
Entrada: `{ name }` con `name ∈ ANALYTICS_EVENTS`. Responde `204`. Solo se persiste el nombre del evento.

## 7. Duplicados

1. Se buscan casos **activos** con la misma serie normalizada.
2. Si alguno coincide en correo (sin distinguir mayúsculas) o RUT normalizado → no se crea un caso nuevo; se devuelve `EXISTING` con el número de caso ya emitido.
3. Si hay casos activos de otra identidad: hasta `MAX_ACTIVE_CASES_PER_SERIAL` se crea el caso con estado `DUPLICATE_CASE` para revisión de Postventa; por encima de ese máximo se responde `DUPLICATE_LIMIT`.

## 8. Modo interino y reproceso

- `settings.serial_database_status = PENDING` por defecto. Se cambia a `COMPLETE` en `/admin/series` cuando Polygon entregó la base y Cross Mountain la validó.
- `reprocessPendingCases` (`src/lib/recall/reprocess.ts`) recorre casos activos con verificación `PENDING_DATABASE`, `NOT_IDENTIFIED` o `UNVERIFIED`, los vuelve a comparar con la base y, si se pide, notifica por correo: coincidencia → `AFFECTED` + correo "tu bicicleta está incluida"; sin coincidencia con base `COMPLETE` → `NOT_IDENTIFIED` + `MANUAL_REVIEW` + correo con el texto de "no aparece actualmente".

## 9. Decisiones de seguridad

| Control | Implementación |
|---|---|
| Base de series solo en servidor | Consulta exacta en `verify.ts`; nunca se envía la lista al cliente ni existe endpoint de descarga. |
| Anti-enumeración | Rate limit por IP hasheada (`RATE_LIMITS.serialLookup`), umbral de resultados no afectados por ventana que exige Turnstile (si está configurado) o bloquea; registro `LOOKUP_SUSPICIOUS` en auditoría. |
| Rate limit de registro, analítica y login admin | `src/lib/server/rate-limit.ts` (en memoria; ver nota en DESPLIEGUE.md para multi-instancia). |
| IPs no almacenadas en claro | `hashIp` = SHA-256(`IP_HASH_SALT` + IP), truncado. |
| Validación de archivos | Magic bytes (JPEG, PNG, WEBP, HEIC/HEIF), extensión permitida, 10 MB por archivo, tope de cantidad y de total; nombres saneados; claves de almacenamiento generadas por el servidor. |
| Archivos privados | Nunca se publican URLs; el panel los sirve por `/api/admin/archivos/[id]` tras validar la sesión, con `no-store` y `nosniff`. |
| Honeypot | Campo `website` oculto; si llega con contenido se responde error genérico. |
| Verificación server-side en el registro | El estado de verificación y el tipo de solicitud se recalculan en el servidor. |
| Sesión admin | Cookie `HttpOnly`, `Secure` en producción, `SameSite=Lax`, firmada con HMAC-SHA256 (`ADMIN_SESSION_SECRET`), 12 h; comparación en tiempo constante; `proxy.ts` + `requireAdmin()` en cada página, acción y ruta. |
| Cabeceras | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS (en `next.config.ts`). Respuestas de API con `Cache-Control: no-store`. |
| Errores | Mensajes genéricos en español; sin stack traces al cliente. |
| Auditoría | `audit_events` con marcas de tiempo del servidor. |
| Analítica sin PII | Lista cerrada de eventos; solo nombre + fecha. |

## 10. Flujo de datos de un caso (resumen)

```
verificar (serie) → resultado → formulario → registro
   → caso RCDH-XXXXX (REGISTERED | MANUAL_REVIEW | DUPLICATE_CASE)
   → correo al cliente + alerta a Postventa (ALTA PRIORIDAD si accidente)
   → Postventa en /admin: VALIDATED → CUSTOMER_CONTACTED → REPLACEMENT_FRAME_ASSIGNED
     → FRAME_IN_TRANSIT → FRAME_RECEIVED → SERVICE_SCHEDULED → REPLACED → CLOSED
```
