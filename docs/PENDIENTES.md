# Pendientes antes del lanzamiento (brief §39 y §40)

Nada de esta lista debe inventarse. Mientras un ítem esté pendiente, el sitio muestra `[POR DEFINIR]` o la marca equivalente. Para cada punto se indica **dónde** se refleja en el código o en la configuración.

## A. A la espera de Polygon

| | Ítem | Dónde se refleja |
|---|---|---|
| [ ] | Base oficial completa de números de serie afectados | Importar con `npm run serials:import -- archivo.csv` o desde `/admin/series` (tabla `affected_serials`). Hasta entonces el ajuste `serial_database_status` queda en `PENDING` (modo interino) |
| [ ] | Confirmación de los modelos exactamente afectados (DH7 / DH9 / otros) | Opciones del formulario: `FORM.options.model` en `src/lib/copy/es.ts` y enum `BIKE_MODELS` en `src/db/schema.ts`; columna `model` del CSV |
| [ ] | Confirmación de los lotes de producción | Columna `production_batch` del CSV; se guarda en `affected_serials.production_batch` |
| [ ] | Confirmación de tallas afectadas (si aplica) | Columna `size` del CSV; opciones `FORM.options.size` |
| [ ] | Terminología oficial de la versión del cuadro de reemplazo | Hoy se usa "cuadro de nueva versión": `RESULT_AFFECTED.body3`, `STEPS.items[4]`, `FAQ` ("¿Qué solución recibiré?") y plantillas de correo en `src/lib/email/templates.ts`. No usar "cuadro reforzado" sin confirmación |
| [ ] | Disponibilidad estimada de cuadros de reemplazo | No se publica ninguna fecha. Si Polygon la confirma por escrito, agregar un texto en `FAQ` y en la sección "¿Qué sucede ahora?" (`STEPS`) |
| [ ] | Declaración técnica oficial aprobada para publicación | Hasta entonces el sitio dice "posible falla estructural del cuadro en la zona de la dirección / pipa de dirección": `SAFETY` y `FAQ` en `src/lib/copy/es.ts` |
| [ ] | Logos oficiales de Polygon | `public/` y cabecera/pie en `src/components/public/`. Hoy son marcas tipográficas provisionales |

## B. Decisiones de Cross Mountain

| | Ítem | Dónde se refleja |
|---|---|---|
| [ ] | Correo de soporte del recall | `NEXT_PUBLIC_CONTACT_EMAIL` en `.env` (sección Contacto, pie y correos). Vacío → "[POR DEFINIR]" |
| [ ] | WhatsApp / teléfono del recall | `NEXT_PUBLIC_CONTACT_WHATSAPP` en `.env` |
| [ ] | Horario de atención | `NEXT_PUBLIC_CONTACT_HOURS` en `.env` |
| [ ] | Correos internos que reciben las alertas de casos | `INTERNAL_NOTIFICATION_EMAILS` en `.env` |
| [ ] | Responsable / equipo de Postventa | Campo "Asignado a" en `/admin`; acceso al panel (`ADMIN_PASSWORD`) |
| [ ] | Redacción final del aviso de privacidad y plazo de retención | `PRIVACY` en `src/lib/copy/es.ts` (contiene marcas `[POR DEFINIR]`) y `docs/SEGURIDAD_Y_PRIVACIDAD.md` §4 |
| [ ] | Logística exacta del reemplazo (dónde se entrega / retira la bicicleta) | Guion y notas en `docs/OPERACION.md`; si se publica, agregar a `FAQ` y `STEPS` |
| [ ] | Si la mano de obra de instalación está incluida y dónde se realiza | Hoy el sitio solo dice "sin costo para el propietario" respecto del reemplazo (`FAQ` "¿Tiene costo?"). Ajustar el texto cuando se decida |
| [ ] | Participación de tiendas / dealers | Campo "Lugar de compra" se recopila (`FORM.fields.dealer`); el portal de dealers es Fase 2 |
| [ ] | Si se exigirá comprobante de compra | Hoy **no** bloquea el registro (`FAQ` "No tengo la boleta original"). Si se exige, ajustar `FAQ` y añadir campo/validación en `src/lib/recall/register.ts` |
| [ ] | Si los propietarios de bicicletas usadas siguen el mismo proceso | Hoy sí (`FAQ` "Compré mi bicicleta usada"). Ajustar si cambia |
| [ ] | Revisión legal final | Textos públicos en `src/lib/copy/es.ts`; correos en `src/lib/email/templates.ts` |
| [ ] | Procedimiento de notificación del recall ante las autoridades chilenas | Ver §C |
| [ ] | Logos oficiales de Cross Mountain | `public/` (marca tipográfica provisional) |
| [ ] | Fecha de "Última actualización" del pie | Se muestra la fecha de build; si se prefiere una fecha editorial, definirla en `FOOTER` en `src/lib/copy/es.ts` |

## C. Nota regulatoria (brief §40)

Este proyecto corresponde a un recall de un producto de consumo en Chile. Antes del lanzamiento público, Cross Mountain debe validar con su asesor legal la comunicación y el procedimiento de notificación conforme a la normativa de protección al consumidor vigente y a los procedimientos aplicables de **SERNAC** (Servicio Nacional del Consumidor). Este repositorio **no** describe ni asume ningún procedimiento regulatorio específico ni incorpora afirmaciones legales.

Para facilitar la elaboración de reportes, el panel permite exportar: unidades afectadas cargadas (`/admin/series` y resumen de métricas), casos registrados (`/api/admin/exportar/casos.csv`), reemplazos completados y casos abiertos (filtros de estado + exportación), y el resumen de indicadores (`/api/admin/exportar/resumen.csv`).

## D. Información que nunca debe publicarse (brief §4)

Conversaciones privadas con Polygon; declaraciones de responsabilidad legal; identidad del rider accidentado o de sus familiares; información médica; especulaciones sobre la causa (soldadura, etc.) sin informe oficial; afirmaciones de que todas las Collosus DH son defectuosas; cifras internas de fallas o garantías; discusiones comerciales internas; historial de garantía de generaciones anteriores salvo inclusión oficial en el alcance.

## E. Fase 2 (no bloquea el lanzamiento, brief §42)

Consulta de estado de caso por el cliente; portal de dealers; asignación automática de cuadros; notificaciones automáticas por correo/WhatsApp en cada cambio de estado; integración con Monday.com; integración con registros de compra de Shopify; cruce automático con compradores conocidos; dashboard de avance; reporte para Polygon; soporte multilingüe.
