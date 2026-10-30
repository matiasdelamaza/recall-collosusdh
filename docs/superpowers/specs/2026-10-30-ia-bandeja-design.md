# IA en la Bandeja: resumen del caso, propuesta de respuesta y entrenamiento

Fecha: 30-10-2026 · Estado: listo para aprobación

## Para qué

Postventa responde a mano los correos de los clientes afectados por la campaña de seguridad Collosus DH.
Se quiere que la IA (Claude vía OpenRouter, la misma integración del análisis de prioridad):

1. Muestre al lado de la conversación un **resumen del caso**: en qué va, qué pide el cliente y qué falta.
2. **Proponga una respuesta** que el equipo revisa, corrige y envía.
3. Se alimente de una sección de **Entrenamiento**: contexto que el equipo carga a mano y las respuestas
   que Postventa ya envió, para que las propuestas se parezcan cada vez más a cómo responde el equipo.

Éxito: abrir una conversación y entender el caso en 10 segundos; responder un correo típico editando un
borrador en vez de escribirlo desde cero.

## Metas

- Resumen visible en el panel lateral de `/admin/bandeja/[messageId]` sin bloquear la carga de la página.
- Botón "Proponer respuesta con IA" en el redactor (Bandeja y ficha del caso) que llena asunto y mensaje.
- Sección `/admin/entrenamiento` para crear, editar, activar y desactivar fichas de contexto.
- La IA usa automáticamente las últimas respuestas manuales de Postventa como ejemplos de estilo.

## Fuera de alcance

- Reentrenar o ajustar el modelo: "entrenar" es contexto que la IA lee en cada llamada.
- Enviar correos sin una persona: la IA nunca envía nada.
- Que el análisis de prioridad (`triage.ts`) use el entrenamiento (posible paso siguiente).
- Resumen en la ficha del caso (`/admin/casos/[caseId]`); solo en la conversación de la Bandeja.

## Lo que haría que fracase aunque funcione

- Que un borrador prometa plazos, reembolsos o afirmaciones técnicas o legales que nadie aprobó.
- Que se envíen a OpenRouter nombre, teléfono, correo o RUT del cliente.
- Que abrir conversaciones dispare un costo alto (una llamada a Opus en cada visita).
- Que una falla de la IA rompa la página o el envío de correos.

## Restricciones

- Proveedor: OpenRouter, `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` ya existentes (por defecto
  `anthropic/claude-sonnet-5.5`), `provider: { require_parameters: true, data_collection: "deny" }`,
  salida con `response_format` JSON schema estricto. Sin clave: las funciones se muestran desactivadas
  con un aviso, el resto del panel sigue igual.
- Toda la interfaz en español. La IA no inventa datos de contacto, textos legales ni afirmaciones técnicas:
  usa solo el entrenamiento, el caso y el hilo; lo que falte lo marca como `[completar: …]`.
- El contenido de los correos es material a analizar, no instrucciones (defensa contra inyección de prompt).
- Base de datos: migración nueva `drizzle/0007_*.sql`. En producción se aplica en Supabase
  (ref wljelbdpazhprpirbibd) con aprobación del usuario antes de publicar el código.
- Se construye sobre la rama `feat/bandeja-estilo-gmail` (aún sin publicar).

## Enfoques considerados

| | Cómo aprende de las respuestas enviadas | A favor | En contra |
|---|---|---|---|
| **A. Automático (elegido)** | Usa las últimas 20 respuestas `kind = MANUAL_EMAIL` | Cero esfuerzo | Puede repetir un error o un plazo viejo |
| B. Curado | Botón "Usar como ejemplo" en cada respuesta enviada | Solo imita lo aprobado | Un clic por respuesta |
| C. Mixto | Automático + marcadas con más peso | Lo mejor de ambos | Más complejo de construir y explicar |

El usuario eligió **A**. Para mitigar su riesgo: en Entrenamiento se listan las respuestas que la IA está
usando y cada una tiene **"Excluir de los ejemplos"** (decisión del constructor, ver abajo).

## Cómo funciona

### 1. Entrenamiento (`/admin/entrenamiento`, en la navegación como "Entrenamiento IA")

- **Fichas** (tabla nueva `ai_knowledge`): `id`, `title` (≤ 120), `body` (≤ 6.000), `active`, `createdAt`,
  `updatedAt`, `updatedBy`. Crear, editar, activar/desactivar y borrar (borrar pide confirmación).
  Tope total de fichas activas: 40.000 caracteres; si se supera, se avisa y no se guarda.
- **Contexto fijo** (solo lectura, plegado): preguntas frecuentes públicas (`FAQ` de `src/lib/copy/es.ts`) y
  las plantillas de `ADMIN.templates`. Ya son textos aprobados y la IA los recibe siempre.
- **Respuestas de ejemplo**: las últimas 20 `MANUAL_EMAIL` enviadas (no masivas ni automáticas), no excluidas,
  mostradas ya anonimizadas tal como las ve la IA. Botón "Excluir de los ejemplos" / "Volver a incluir"
  (columna nueva `email_messages.ai_excluded_at`).
- Cambios de fichas y exclusiones quedan en la bitácora de auditoría (`AI_KNOWLEDGE_CHANGED`).

### 2. Anonimización (todo lo que va a la IA en estas funciones)

Función `redactForAi(text, ctx)`:
- Nombre del cliente del caso (completo y nombre de pila) → `{nombre}`; número de caso → `{caso}`;
  serie → `{serie}`.
- Cualquier correo → `[correo]`, teléfono chileno → `[teléfono]`, RUT → `[rut]`.
Se aplica a correos del hilo, notas internas, respuestas de ejemplo y al análisis de prioridad. Del caso solo van campos sin datos
personales: estado, modelo, talla, accidente declarado, daño declarado, fechas de registro y último contacto,
motivos del semáforo.

### 3. Resumen del caso (panel lateral)

- Tabla nueva `ai_summaries`: `threadKey` (pk: id del caso, o `email:<contraparte>` sin caso),
  `lastMessageId`, `content` jsonb, `model`, `createdAt`.
- Al abrir la conversación, la tarjeta "Resumen con IA" se carga en un `<Suspense>` con esqueleto:
  si el resumen guardado corresponde al último correo del hilo, se muestra; si no, se genera, se guarda y se
  muestra. Así solo hay una llamada por correo nuevo, no por visita.
- Botón "Actualizar" (server action) fuerza uno nuevo.
- Contenido (JSON schema): `resumen` (≤ 3 frases), `pide` (qué pide el cliente ahora), `pendiente`
  (lista corta de acciones de Postventa), `alerta` (riesgo de seguridad o reclamo, o vacío).
- Pie: hora de generación y "Generado con IA: revísalo antes de actuar".
- Si falla o no hay clave: mensaje "No se pudo generar el resumen" con botón reintentar; la página sigue.

### 4. Propuesta de respuesta (redactor)

- Botón "Proponer respuesta con IA" en `EmailComposer` (Bandeja y ficha del caso). Server action
  `draftReplyAction` con `messageId` o `caseId`; devuelve `{ subject, body }` y llena los campos.
  Si el mensaje ya tiene texto, pide confirmar antes de reemplazarlo.
- La IA recibe: contexto fijo, fichas activas, respuestas de ejemplo, datos del caso y el hilo (todo anonimizado).
  **No recibe las notas internas**: pueden traer información no aprobada para el cliente. Las notas solo van al resumen.
- Fuentes de hechos: solo el contexto fijo, las fichas activas y los datos del caso y del hilo.
  Las respuestas de ejemplo enseñan **solo tono y forma**: un plazo, paso o monto que aparezca únicamente en
  un ejemplo no se usa y se marca `[completar: …]`. El prompt separa las dos cosas y hay una prueba para eso.
- Reglas del prompt: saluda con `Hola {nombre}:` (el redactor ya reemplaza `{nombre}`), no agrega firma,
  número de caso, serie ni datos de contacto (el envío los agrega solo), no promete nada que no esté en el
  contexto y marca lo que falte con `[completar: …]`.
- **Envío bloqueado** si el mensaje aún contiene `[completar`: error en línea "Completa las partes marcadas".
- Mientras genera: botón deshabilitado con "Generando propuesta…"; error en línea si falla.
- Auditoría: `AI_DRAFT_GENERATED` en el caso (sin guardar el texto).

### 5. Cliente compartido de OpenRouter

Se extrae la llamada de `triage.ts` a `src/lib/ai/openrouter.ts` (`callOpenRouterJson`), con los mismos
registros de error que hoy. El análisis de prioridad pasa a usarlo.

**Cambio en el análisis de prioridad (decidido por el usuario):** hoy manda el cuerpo del correo sin anonimizar.
Pasa a mandar el asunto y el cuerpo por `redactForAi` (nombre del caso o del remitente, correos, teléfonos, RUT).
Las reglas fijas siguen leyendo el texto original. Prueba nueva: el cuerpo que llega a OpenRouter no contiene
el correo, teléfono ni RUT del ejemplo.

## Pruebas

- Anonimización: nombres, correos, teléfonos, RUT, caso y serie.
- El prompt del borrador incluye fichas activas y ejemplos, excluye fichas inactivas y respuestas excluidas,
  y no contiene datos personales del caso.
- `draftReplyAction` con `fetch` simulado: éxito, error 500, sin clave.
- Resumen: se reutiliza si no hay correos nuevos; se regenera cuando llega uno.
- Envío rechazado con `[completar`.
- Suite completa, typecheck y build; verificación visual en la demo local (escritorio y 375 px).

## Publicación

1. Publicar primero el rediseño estilo Gmail (rama `feat/bandeja-estilo-gmail`).
2. Aplicar la migración 0007 en Supabase (con aprobación).
3. Fusionar y publicar este trabajo (con aprobación). Sin variables de entorno nuevas.

## Decisiones del constructor (revisar)

- Botón "Excluir de los ejemplos" para mitigar el modo automático.
- Ejemplos = correos `MANUAL_EMAIL` (el único envío manual que existe), sin la firma, caso y serie que el
  envío agrega solo (`manualEmail` en `src/lib/email/templates.ts`).
- Los ejemplos sirven solo de estilo, nunca como fuente de hechos.
- 20 respuestas de ejemplo, 40.000 caracteres de fichas, 15 correos del hilo (3.000 caracteres cada uno).
- Resumen solo en la Bandeja, no en la ficha del caso.
- Bloquear el envío mientras quede `[completar`.
- Notas internas solo en el resumen, no en el borrador (el usuario no eligió; se tomó la opción más segura).

## Queda a criterio de quien construye

Diseño visual de la sección y de las tarjetas (siguiendo `ui.tsx` y el estilo de la Bandeja), redacción exacta
de los prompts, nombres internos de funciones y el esqueleto de carga.
