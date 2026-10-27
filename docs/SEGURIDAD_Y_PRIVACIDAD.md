# Seguridad y privacidad

Este documento describe qué datos personales recopila el portal, dónde se almacenan, quién accede a ellos y qué controles técnicos existen. La redacción pública del aviso de privacidad vive en `PRIVACY` dentro de `src/lib/copy/es.ts` y **debe ser revisada por el asesor legal / de cumplimiento de Cross Mountain antes del lanzamiento** (brief §28).

## 1. Datos que se recopilan

| Dato | Finalidad | Dónde se guarda |
|---|---|---|
| Nombre completo, RUT, correo, teléfono/WhatsApp, región, ciudad | Identificar al propietario y contactarlo para coordinar el reemplazo | `recall_cases` |
| Número de serie, modelo, talla, lugar y fecha aproximada de compra | Verificar inclusión en la campaña y gestionar el cuadro de reemplazo | `recall_cases` |
| Fotografías (serie, bicicleta completa, zona de dirección, daños) | Validar la unidad y el estado del cuadro | Almacenamiento privado (`local` o bucket S3-compatible privado); referencia en `case_files` |
| Declaración de daño / accidente y descripción breve | Priorizar la atención (prioridad ALTA) | `recall_cases` |
| IP (hasheada con sal), user agent | Rate limiting, detección de enumeración, auditoría | `serial_lookups`, `recall_cases`, `audit_events` |
| Eventos de analítica | Medir uso del portal | `analytics_events` — **solo nombre del evento y fecha** |

Principio de minimización: el formulario pide únicamente lo necesario para el recall (brief §28). No se solicita información médica; la descripción del incidente es breve y el formulario indica explícitamente que no es necesario incluirla.

## 2. Qué NO se almacena ni se envía a terceros

- IPs en claro.
- RUT, correo, teléfono, serie completa ni descripciones de incidentes en analítica (brief §29).
- Datos de clientes en el código fuente ni en respuestas públicas de la API.
- La base de series afectadas de Polygon nunca sale del servidor.

## 3. Quién accede

- **Equipo de Postventa de Cross Mountain** a través de `/admin`, protegido por contraseña y cookie firmada.
- **Polygon Bikes**: solo información agregada (métricas) o la estrictamente necesaria para el reemplazo, según defina Cross Mountain.
- Proveedores de infraestructura (hosting, base de datos, almacenamiento, correo) como encargados del tratamiento. Deben configurarse con acceso restringido (ver recomendaciones).

## 4. Retención

`[POR DEFINIR]` — Cross Mountain debe fijar el plazo de conservación de casos y fotografías una vez concluida la campaña y las obligaciones legales/de garantía asociadas (brief §28). El esquema registra `created_at`, `updated_at` y `closed_at` para permitir una política de borrado o anonimización por fecha.

## 5. Controles técnicos implementados

| Área | Control |
|---|---|
| Transporte | HTTPS obligatorio (HSTS en `next.config.ts`; configurar redirección HTTP→HTTPS en el proveedor). |
| Cabeceras | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. |
| Verificación de series | Coincidencia exacta server-side; sin coincidencia difusa; sin lista descargable. |
| Enumeración | Rate limit por IP hasheada; umbral de consultas sin coincidencia que exige Turnstile (opcional) o bloquea temporalmente; auditoría `LOOKUP_SUSPICIOUS`. |
| Formularios | Validación y saneamiento en servidor (zod), mensajes genéricos, honeypot, rate limit por IP, límite de tamaño de la solicitud. |
| Archivos | Tipo verificado por magic bytes (no por extensión ni por `Content-Type` del cliente), extensiones permitidas, 10 MB por archivo, tope de archivos por caso, nombres saneados, claves generadas por el servidor, servicio solo mediante ruta autenticada con `no-store` y `nosniff`. |
| Panel interno | Contraseña comparada en tiempo constante, rate limit de inicio de sesión, cookie `HttpOnly`/`Secure`/`SameSite=Lax` firmada con HMAC-SHA256, expiración 12 h, verificación en cada página/acción/ruta, `noindex`. |
| Auditoría | `audit_events` con fecha del servidor para creación de casos, cambios de estado, notas, asignaciones, correos, importaciones, accesos y exportaciones. |
| Errores | Sin stack traces hacia el cliente; mensajes en español. |
| Dependencias | Sin SDKs de analítica de terceros; analítica interna sin PII. |

## 6. Recomendaciones operativas

1. **Secretos**: generar `ADMIN_SESSION_SECRET` e `IP_HASH_SALT` con `openssl rand -base64 48`; no reutilizarlos entre entornos; guardarlos solo en el gestor de secretos del proveedor.
2. **Contraseña del panel**: fuerte (≥ 16 caracteres), compartida solo con el equipo de Postventa por un canal seguro, **rotada** al cambiar integrantes del equipo y al cerrar la campaña. Cambiarla invalida todas las sesiones si además se rota `ADMIN_SESSION_SECRET`.
3. **Base de datos**: en Supabase, desactivar el acceso anónimo/API pública a las tablas (el portal usa la conexión directa con `DATABASE_URL`, no la API REST), restringir las IPs si es posible y activar backups automáticos diarios.
4. **Almacenamiento**: bucket **privado** (sin acceso público de lectura), credenciales con permisos mínimos (`PutObject`, `GetObject`, `DeleteObject` sobre ese bucket).
5. **Correo**: dominio remitente con SPF/DKIM/DMARC configurados para que las confirmaciones no caigan en spam.
6. **Logs**: los logs del proveedor pueden contener rutas y códigos de estado, pero el portal no escribe datos personales en consola salvo con `EMAIL_PROVIDER=console` (solo desarrollo). No usar `console` en producción.
7. **Exportaciones CSV**: contienen datos personales. Guardarlas solo en ubicaciones controladas de Cross Mountain y eliminarlas cuando dejen de ser necesarias.
8. **Rate limiting multi-instancia**: si el despliegue escala a varias instancias o regiones, migrar `src/lib/server/rate-limit.ts` a un backend compartido (Redis/Upstash) conservando la misma interfaz.
9. **Revisión legal**: validar el aviso de privacidad y el procedimiento de notificación del recall con el asesor legal y con los requisitos aplicables de SERNAC antes del lanzamiento (brief §40). Este repositorio no incorpora afirmaciones legales más allá del aviso de privacidad marcado `[POR DEFINIR]`.
10. **Derechos de los titulares**: atender solicitudes de acceso, rectificación o eliminación a través del canal de Postventa; el panel permite localizar casos por RUT o correo y exportar la información.

## 7. Datos que no deben publicarse (brief §4)

Nunca incorporar al sitio, a correos ni a exportaciones compartidas: conversaciones privadas con Polygon, declaraciones de responsabilidad legal, identidad del rider accidentado o de sus familiares, información médica, especulaciones sobre causa raíz (soldadura, etc.), porcentajes históricos de garantía ni discusiones comerciales internas.
