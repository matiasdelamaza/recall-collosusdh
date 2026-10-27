# Runbook de operación — Equipo de Postventa

Guía práctica para operar la campaña de recall Polygon Collosus DH desde el panel interno (`https://recallcollosusdh.cl/admin`). Léela completa antes de atender el primer caso.

## 1. Acceso al panel

- URL: `/admin/login`. Contraseña compartida por el responsable de Postventa (no la envíes por canales no seguros).
- La sesión dura 12 horas. Cierra sesión en equipos compartidos.
- Secciones: **Casos** (lista y detalle), **Métricas**, **Base de series**.

## 2. Flujo de un caso de principio a fin

1. **Llega un caso.** El propietario verificó su serie y completó el formulario. Recibirás un correo interno con el número de caso (`RCDH-XXXXX`), nombre, teléfono, serie, modelo, daño sí/no y accidente sí/no. Si el asunto empieza con `[ALTA PRIORIDAD]`, ve a §4.
2. **Revisa el caso** en `/admin/casos/RCDH-XXXXX`: datos del cliente, fotos (serie, bicicleta completa, zona de dirección, daños), estado de verificación y tipo de solicitud.
3. **Valida**: la foto de la serie coincide con la serie registrada, la bicicleta es una Collosus DH y el modelo/talla son razonables. Cambia el estado a **Validado**. Si la serie no coincide o no es una Collosus DH → **Serie inválida** y nota explicativa.
4. **Contacta al cliente** (correo, WhatsApp o teléfono) y deja una nota con fecha, canal y acuerdos. Estado → **Cliente contactado**. Si no responde tras varios intentos documentados → **Cliente no contactable** (revisar semanalmente).
5. **Asigna el cuadro de reemplazo** cuando Polygon confirme la unidad: registra la serie y la versión del nuevo cuadro en el caso. Estado → **Cuadro de reemplazo asignado**.
6. **Seguimiento logístico**: **Cuadro en tránsito** → **Cuadro recibido** → **Servicio agendado** (fecha del traspaso de componentes; registrar lugar y taller en nota).
7. **Reemplazo realizado** y bicicleta entregada → **Reemplazado**. Al terminar cualquier gestión pendiente → **Cerrado**.

Cada cambio de estado, nota y asignación queda en la bitácora del caso.

## 3. Estados: significado y cuándo usarlos

| Estado (panel) | Úsalo cuando… |
|---|---|
| Registrado | El caso acaba de llegar y nadie lo ha revisado. |
| Validado | Revisaste fotos y datos; todo es consistente. |
| Cliente contactado | Hubo contacto efectivo (no solo intento). |
| Cuadro de reemplazo asignado | Hay una unidad de nueva versión asignada a este caso (serie registrada). |
| Cuadro en tránsito | El cuadro viaja hacia Chile o hacia el punto de servicio. |
| Cuadro recibido | El cuadro está físicamente disponible para el servicio. |
| Servicio agendado | Hay fecha para el cambio de cuadro. |
| Reemplazado | El cambio se hizo y el cliente tiene su bicicleta. |
| Cerrado | No queda nada pendiente. |
| Revisión manual | La serie no apareció en la base, no se pudo verificar, o llegó en modo interino y sigue sin coincidencia. Requiere decisión humana. |
| Serie inválida | La serie no corresponde (error de tipeo confirmado, otro modelo, etc.). Deja nota. |
| Caso duplicado | Otra persona ya registró la misma serie. Verifica identidad/propiedad antes de continuar (§5). |
| Cliente no contactable | Tres o más intentos documentados sin respuesta. Reintentar periódicamente. |

Tipos de solicitud: **Reemplazo de cuadro** (serie afectada), **Revisión manual** (no identificada / no verificable) y **Registro interino** (llegó antes de cargar la base de Polygon).

## 4. Prioridad ALTA (accidente declarado)

Un caso tiene prioridad **Alta** cuando el propietario declaró un incidente o caída posiblemente relacionado con una falla del cuadro. En la lista aparece destacado en rojo y el correo interno lleva `[ALTA PRIORIDAD]`.

Atención inmediata:
1. Contactar al cliente **el mismo día hábil**, con empatía y sin pedir información médica.
2. Confirmar que la bicicleta **no se está usando** y pedir que conserve el cuadro tal como está (no reparar, no soldar, no desechar).
3. Registrar en nota: fecha del incidente (si la entrega), estado del cuadro, fotos adicionales recibidas.
4. Escalar internamente al responsable de la campaña y, por el canal acordado, a Polygon.
5. No emitir opiniones sobre la causa de la falla ni sobre responsabilidades (§8).

Los casos con **daño declarado** (fisura, separación, deformación) sin accidente también deben contactarse con prioridad y recibir la instrucción explícita de no utilizar la bicicleta.

## 5. Duplicados

- **"Ya existe una solicitud" (EXISTING)**: la misma persona (mismo correo o RUT) volvió a registrar la misma serie. El sitio no crea un caso nuevo y le muestra su número de caso original. No requiere acción.
- **Caso duplicado (DUPLICATE_CASE)**: otra identidad registró una serie que ya tiene un caso activo. Posibles causas: venta de la bicicleta usada, error de tipeo en la serie, registro por un familiar, o intento indebido. Acción: compara fotos de la serie en ambos casos, contacta a ambos registrantes, determina quién posee la bicicleta hoy, conserva un caso activo y cierra el otro con estado **Cerrado** o **Serie inválida** y nota.
- Si una serie acumula varios casos activos de distintas personas, el sitio deja de aceptar registros para esa serie y pide contactar a Postventa.

## 6. Modo interino → base de Polygon → reproceso

Mientras Polygon no entregue la base de series, el sitio opera en **modo interino**: solo las series ya cargadas devuelven "afectada"; las demás reciben "pendiente de verificación" y se registran como **Registro interino**.

Cuando llegue la base:
1. **Base de series → Importar CSV** con la casilla "Solo validar" marcada. Revisa filas leídas, insertadas, omitidas y errores.
2. Repite sin la casilla para importar. Compara el total de series con lo informado por Polygon.
3. Verifica manualmente 2–3 series conocidas desde la portada.
4. Marca la base como **Cargada y validada (COMPLETE)**. Desde ese momento, una serie sin coincidencia recibe "no aparece actualmente dentro de las unidades incluidas" (nunca "es segura").
5. **Reprocesar casos pendientes**: primero con "Simular" para ver cuántos casos cambiarían; luego con "Notificar a clientes".

Correos que envía el reproceso:
- Caso cuya serie **sí** está en la base → pasa a *Unidad afectada / Reemplazo de cuadro* y el cliente recibe **"IMPORTANTE: tu bicicleta está incluida en el recall"** con la instrucción de no utilizarla.
- Caso cuya serie **no** está en la base (con base COMPLETE) → pasa a *No identificada / Revisión manual* y el cliente recibe **"Resultado de verificación"** con el texto "no aparece actualmente…" y la recomendación de contactar a Postventa ante cualquier daño. Postventa debe revisar y cerrar estos casos.

Si Polygon envía ampliaciones de la base más adelante, repite importación + reproceso: las series existentes se actualizan y solo cambian los casos cuyo resultado varía.

## 7. Exportar y reportar a Polygon

- **Casos → Exportar CSV** respeta los filtros aplicados (estado, prioridad, daño, accidente, tipo). Se abre en Excel (separador `;`, UTF-8).
- **Métricas → Exportar resumen** entrega los indicadores clave.

Indicadores que debes poder reportar (brief §31): total de series afectadas cargadas; total de consultas de serie; consultas con resultado afectada; bicicletas afectadas registradas; clientes contactados; cuadros de reemplazo asignados; reemplazos completados; casos abiertos; casos cerrados; casos con accidente; casos con daño en el cuadro; tasa de completitud (reemplazados / afectadas registradas).

Las exportaciones contienen datos personales: compártelas con Polygon solo de forma agregada o con los campos estrictamente necesarios, y elimínalas cuando dejen de usarse.

## 8. Qué NO decir a los clientes (brief §4, §33, §36)

No afirmar ni sugerir:
- "Tu bicicleta es segura", "no hay riesgo", "100 % segura".
- "La falla fue por una soldadura / por un defecto de fabricación / por negligencia" (no hay informe técnico oficial).
- "Polygon reconoció su responsabilidad", "Polygon pagará…".
- "Todas las Collosus DH son defectuosas".
- Cualquier dato sobre el rider accidentado, su familia o su estado de salud.
- Porcentajes de fallas, cifras internas de garantía o conversaciones internas con Polygon.
- Plazos de llegada de cuadros que Polygon no haya confirmado por escrito.
- "Cuadro reforzado" (usa **"cuadro de nueva versión"** mientras Polygon no confirme otra terminología).

Sí decir: "campaña de recall / de seguridad", "unidades afectadas", "posible falla estructural del cuadro en la zona de la dirección", "número de serie", "cuadro de nueva versión", "no utilices la bicicleta", "sin costo para el propietario".

## 9. Guion breve de contacto

> Hola, le habla [nombre] del equipo de Postventa de Polygon Chile, Cross Mountain. Me comunico por su registro en la campaña de recall de seguridad Polygon Collosus DH, caso [RCDH-XXXXX].
>
> Su número de serie corresponde a una unidad incluida en la campaña. Lo más importante: **no utilice la bicicleta** hasta que se complete el reemplazo del cuadro. Polygon Bikes y Cross Mountain reemplazarán el cuadro por una nueva versión, sin costo para usted.
>
> Para coordinar, necesito confirmar [dirección / ciudad / taller de preferencia] y revisar las fotos que adjuntó. Le avisaremos en cuanto el cuadro de reemplazo esté asignado y nuevamente cuando esté disponible para el servicio. ¿Tiene alguna duda sobre los próximos pasos?

Si pregunta por plazos: "Aún no tenemos una fecha confirmada por Polygon; le informaremos apenas la tengamos." Si pregunta por la causa: "La campaña se originó por reportes de una posible falla estructural en la zona de la dirección; no existe aún un informe técnico oficial, por eso la medida es preventiva."

## 10. Rutinas sugeridas

- **Diario**: revisar casos nuevos y de prioridad Alta; responder correos; actualizar estados.
- **Semanal**: revisar *Revisión manual*, *Caso duplicado* y *Cliente no contactable*; exportar resumen de métricas para el responsable de la campaña y para Polygon.
- **Al recibir cuadros**: actualizar estados en lote (asignado → en tránsito → recibido) y agendar servicios.
- **Cierre de campaña**: todos los casos en *Reemplazado* / *Cerrado* / *Serie inválida*; aplicar la política de retención de datos definida por Cross Mountain.
