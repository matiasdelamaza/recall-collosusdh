/**
 * TODO EL TEXTO VISIBLE AL USUARIO FINAL VIVE AQUÍ, EN ESPAÑOL.
 *
 * Regla del brief (§0): ningún texto visible para el usuario final puede quedar en inglés,
 * salvo nombres propios de marca o modelo (Polygon, Collosus DH7, Collosus DH9, Cross Mountain).
 *
 * Los valores "[POR DEFINIR]" son datos que Cross Mountain aún debe confirmar. NO inventar.
 */

export const BRAND = {
  manufacturer: "Polygon Bikes",
  distributor: "Cross Mountain SpA",
  distributorShort: "Cross Mountain",
  product: "Polygon Collosus DH",
  models: ["Collosus DH7", "Collosus DH9"],
  domain: "recallcollosusdh.cl",
} as const;

export const SEO = {
  title: "Recall Polygon Collosus DH Chile | Verificación de Número de Serie",
  description:
    "Campaña oficial de seguridad Polygon Collosus DH en Chile. Ingresa el número de serie de tu bicicleta para verificar si está incluida en el recall y conocer los pasos para el cambio de cuadro.",
  siteName: "Recall de Seguridad Polygon Collosus DH — Chile",
} as const;

export const HEADER = {
  eyebrow: "Collosus DH · Recall de Seguridad",
  nav: {
    verify: "Verificar bicicleta",
    whatToDo: "Qué hacer",
    faq: "Preguntas frecuentes",
    contact: "Contacto",
  },
} as const;

export const HERO = {
  kicker: "POLYGON COLLOSUS DH",
  title: "RECALL DE SEGURIDAD",
  subtitle: "La seguridad de nuestros riders es nuestra máxima prioridad.",
  body1: "Polygon Bikes y Cross Mountain han iniciado una campaña de recall en Chile para determinadas unidades Polygon Collosus DH.",
  body2: "Si tienes una Polygon Collosus DH, verifica el número de serie de tu bicicleta.",
  serialLabel: "Número de serie",
  serialPlaceholder: "Ej.: A25012345",
  cta: "VERIFICAR MI BICICLETA",
  ctaLoading: "Verificando…",
  whereIsSerial: "¿Dónde encuentro mi número de serie?",
  interimNotice:
    "Ingresa el número de serie de tu bicicleta para saber si está incluida en esta campaña. Si lo está, te indicaremos cómo seguir.",
} as const;

/** Mensajes de validación del campo de serie (cliente y servidor). */
export const SERIAL_VALIDATION = {
  EMPTY: "Ingresa el número de serie de tu bicicleta.",
  TOO_SHORT: "El número de serie parece incompleto. Revisa que hayas ingresado todos los caracteres.",
  TOO_LONG: "El número de serie es demasiado largo. Revisa que no incluya texto adicional.",
  INVALID_CHARS: "El número de serie solo puede contener letras, números y guiones.",
} as const;

export const RESULT_AFFECTED = {
  badge: "Unidad afectada",
  title: "TU BICICLETA ESTÁ INCLUIDA EN ESTE RECALL",
  subtitle: "NO UTILICES LA BICICLETA",
  body1: "El número de serie ingresado corresponde a una unidad incluida en la campaña de recall Polygon Collosus DH.",
  body2: "No utilices la bicicleta hasta que se haya realizado el reemplazo del cuadro.",
  body3: "Polygon Bikes y Cross Mountain realizarán el reemplazo del cuadro afectado por una nueva versión sin costo para el propietario.",
  body4: "Para realizar el cambio, deberás enviarnos el cuadro afectado. Nuestro equipo de Postventa te indicará cómo hacerlo.",
  cta: "INICIAR PROCESO DE REEMPLAZO",
  serialLabel: "Número de serie verificado",
} as const;

export const RESULT_NOT_IDENTIFIED = {
  badge: "No identificada actualmente",
  title: "TU NÚMERO DE SERIE NO APARECE ACTUALMENTE DENTRO DE LAS UNIDADES INCLUIDAS EN ESTA CAMPAÑA",
  body1: "El número ingresado no coincide con los números de serie actualmente identificados por Polygon Bikes para este recall.",
  body2: "Esto no constituye una inspección técnica ni una certificación individual del estado de tu bicicleta.",
  body3: "Si observas cualquier fisura, separación, deformación o daño en el cuadro, suspende su uso y comunícate con nuestro equipo de Postventa.",
  ctaReview: "SOLICITAR REVISIÓN",
  ctaAnother: "VERIFICAR OTRO NÚMERO",
} as const;

/**
 * No afectada: la serie figura como OK en la lista de Polygon (cuadro con la última optimización),
 * es decir, NO incluida en la campaña. Internamente es el estado REINFORCED.
 * BORRADOR pendiente de revisión legal y de Polygon (ver docs/PENDIENTES.md). Reglas: no afirmar que
 * la bicicleta "es segura" ni usar "cuadro reforzado" hasta que Polygon confirme la terminología.
 */
export const RESULT_REINFORCED = {
  badge: "No afectada",
  title: "TU BICICLETA NO PERTENECE A LA TANDA AFECTADA",
  body1: "El número de serie ingresado no forma parte de las unidades incluidas en esta campaña.",
  body2: "Puedes seguir usando tu bicicleta con normalidad. No necesitas registrarla ni realizar ningún trámite.",
  body3: "Si ves fisuras, grietas o deformaciones en el cuadro, deja de usar la bicicleta y completa el formulario.",
  /** En el correo el cliente ya tiene un caso: responde el correo (llega a Postventa) en vez de llenar el formulario. */
  emailBody3: "Si ves fisuras, grietas o deformaciones en el cuadro, deja de usar la bicicleta y responde este correo con fotos de la zona.",
  serialLabel: "Número de serie verificado",
  ctaDamage: "COMPLETAR FORMULARIO",
  ctaAnother: "VERIFICAR OTRO NÚMERO",
} as const;

/** Base completa cargada y la serie no aparece en la lista: lo más probable es un error de tipeo. */
export const RESULT_NOT_FOUND = {
  badge: "Número no encontrado",
  title: "NO ENCONTRAMOS ESE NÚMERO DE SERIE",
  body1: "Revisa que hayas ingresado el número completo, sin espacios, tal como aparece en el cuadro, e inténtalo nuevamente.",
  formatLabel: "Cómo es el número",
  formatBody: "Por lo general tiene 9 caracteres: 1 letra seguida de 8 números. Si después de la letra inicial ves una \"O\", lo más probable es que sea un cero.",
  exampleLabel: "Ejemplo",
  locationLabel: "Dónde está",
  locationBody: "Grabado en la parte inferior del cuadro, bajo la caja del pedalier (donde se unen las bielas).",
  locationLink: "Ver foto de dónde está el número de serie",
  retry: "VOLVER A INTENTAR",
  /** Tras varios intentos sin coincidencia se ofrece la revisión manual. */
  manualTitle: "¿El número está bien escrito?",
  manualBody: "Si ya lo revisaste y sigue sin aparecer, solicita una revisión manual: nuestro equipo de Postventa verificará el número con la foto del cuadro y te contactará.",
  manualSafety: "Hasta recibir confirmación, recomendamos no utilizar la bicicleta.",
  manualCta: "SOLICITAR REVISIÓN MANUAL",
  contactLink: "Ver canales de contacto de Postventa",
} as const;


/** Modo interino: la base de Polygon aún no está cargada. */
export const RESULT_PENDING_DATABASE = {
  badge: "Verificación pendiente",
  title: "NÚMERO DE SERIE PENDIENTE DE VERIFICACIÓN",
  body1: "Todavía no podemos confirmar si este número de serie está incluido en la campaña: la lista oficial de unidades aún está en validación.",
  body2: "Registra tu bicicleta y te avisaremos apenas tengamos la confirmación.",
  safety: "Mientras no confirmemos el estado de tu bicicleta, como precaución te recomendamos no usarla.",
  cta: "REGISTRAR MI BICICLETA",
  ctaAnother: "VERIFICAR OTRO NÚMERO",
} as const;

export const RESULT_RATE_LIMITED = {
  title: "DEMASIADAS CONSULTAS",
  body: "Has realizado demasiadas verificaciones en poco tiempo. Espera unos minutos e inténtalo nuevamente. Si necesitas ayuda, contacta a nuestro equipo de Postventa.",
} as const;

export const RESULT_ERROR = {
  title: "NO PUDIMOS PROCESAR TU CONSULTA",
  body: "Ocurrió un problema temporal. Inténtalo nuevamente en unos minutos.",
  retry: "REINTENTAR",
} as const;

export const FORM = {
  title: {
    REPLACEMENT: "Registro para reemplazo de cuadro",
    MANUAL_REVIEW: "Solicitud de revisión manual",
    PENDING_DATABASE: "Registro de bicicleta",
    DAMAGE_REVIEW: "Revisión de daño en el cuadro",
  },
  intro: {
    REPLACEMENT: "Completa tus datos para generar tu caso. Nuestro equipo de Postventa se pondrá en contacto contigo para coordinar el reemplazo del cuadro.",
    MANUAL_REVIEW: "Completa tus datos y adjunta una foto clara del número de serie. Nuestro equipo de Postventa revisará tu caso.",
    PENDING_DATABASE: "Completa tus datos. Una vez que Polygon Bikes confirme la base de números de serie, te notificaremos el resultado de la verificación.",
    DAMAGE_REVIEW: "Completa tus datos y adjunta fotos de la zona dañada del cuadro. Nuestro equipo de Postventa revisará tu caso y se pondrá en contacto contigo.",
  },
  sections: {
    customer: "Datos del propietario",
    bike: "Datos de la bicicleta",
    uploads: "Fotografías",
    incident: "Estado del cuadro",
    confirm: "Confirmación",
  },
  fields: {
    customerName: "Nombre completo",
    rut: "RUT",
    rutPlaceholder: "12.345.678-9",
    email: "Correo electrónico",
    phone: "Teléfono / WhatsApp",
    phonePlaceholder: "+56 9 1234 5678",
    region: "Región",
    regionPlaceholder: "Selecciona tu región",
    city: "Ciudad / comuna",
    serialNumber: "Número de serie",
    serialReadOnlyHint: "Verificado. No es editable.",
    model: "Modelo",
    size: "Talla",
    dealer: "Lugar de compra",
    dealerPlaceholder: "Tienda o canal donde compraste la bicicleta",
    purchaseDate: "Fecha aproximada de compra",
    purchaseDatePlaceholder: "Ej.: marzo 2026",
    serialPhoto: "Foto clara del número de serie del cuadro",
    bikePhoto: "Foto completa de la bicicleta",
    headtubePhoto: "Foto de la zona de la dirección / pipa de dirección (recomendada)",
    additionalPhotos: "Fotos adicionales de daños (opcional)",
    damageReported: "¿El cuadro presenta actualmente alguna fisura, separación, deformación o daño estructural?",
    acknowledge: "Confirmo que he leído la instrucción de no utilizar la bicicleta hasta completar el procedimiento de reemplazo.",
    acknowledgeDamage: "Confirmo que no utilizaré la bicicleta hasta que Postventa revise el cuadro.",
    privacy: "He leído el aviso de privacidad y autorizo el uso de mis datos exclusivamente para la gestión de esta campaña de recall.",
  },
  options: {
    model: { COLLOSUS_DH7: "Collosus DH7", COLLOSUS_DH9: "Collosus DH9", NOT_SURE: "No estoy seguro/a" },
    size: { S: "S", M: "M", L: "L", XL: "XL", NOT_SURE: "No estoy seguro/a" },
    tri: { YES: "Sí", NO: "No", NOT_SURE: "No estoy seguro/a" },
    yesNo: { YES: "Sí", NO: "No" },
  },
  uploadHint: "Formatos: JPG, PNG, WEBP o HEIC. Las fotos se reducen automáticamente antes de enviarse.",
  required: "Obligatorio",
  optional: "Opcional",
  submit: {
    REPLACEMENT: "REGISTRAR Y SOLICITAR REEMPLAZO",
    MANUAL_REVIEW: "ENVIAR SOLICITUD DE REVISIÓN",
    PENDING_DATABASE: "REGISTRAR MI BICICLETA",
    DAMAGE_REVIEW: "ENVIAR SOLICITUD DE REVISIÓN",
  },
  submitting: "Enviando…",
  back: "Volver",
} as const;

/** Mensajes de validación de formulario (cliente y servidor). */
export const FORM_VALIDATION = {
  required: "Este campo es obligatorio.",
  customerName: "Ingresa tu nombre completo.",
  rut: "Ingresa un RUT válido (ej.: 12.345.678-9).",
  email: "Ingresa un correo electrónico válido.",
  phone: "Ingresa un teléfono válido (ej.: +56 9 1234 5678).",
  region: "Selecciona tu región.",
  city: "Ingresa tu ciudad o comuna.",
  model: "Selecciona el modelo.",
  size: "Selecciona la talla.",
  damageReported: "Indica si el cuadro presenta daños.",
  accidentReported: "Indica si has tenido un incidente relacionado.",
  incidentDescription: "Describe brevemente lo ocurrido.",
  serialPhoto: "Adjunta una foto clara del número de serie.",
  bikePhoto: "Adjunta una foto completa de la bicicleta.",
  fileType: "Formato de archivo no permitido. Usa JPG, PNG, WEBP o HEIC.",
  fileSize: "La foto es demasiado grande. Usa una foto de menor resolución o tómala nuevamente.",
  tooManyFiles: "Has adjuntado demasiados archivos.",
  acknowledge: "Debes confirmar que has leído la instrucción de no utilizar la bicicleta.",
  privacy: "Debes aceptar el aviso de privacidad para continuar.",
  generic: "Revisa los campos marcados e inténtalo nuevamente.",
  serverError: "No pudimos registrar tu solicitud. Inténtalo nuevamente en unos minutos o contacta a nuestro equipo de Postventa.",
  rateLimited: "Has enviado demasiadas solicitudes en poco tiempo. Espera unos minutos e inténtalo nuevamente.",
  tooLarge: "Las fotos adjuntas superan el tamaño total permitido (4 MB). Adjunta menos fotos o usa fotos de menor resolución.",
  duplicateLimit: "Ya existen solicitudes activas para este número de serie. Nuestro equipo de Postventa revisará la situación y se pondrá en contacto contigo.",
} as const;

export const SUCCESS = {
  title: "HEMOS RECIBIDO TU SOLICITUD",
  subtitle: "NO UTILICES TU BICICLETA",
  body: "Nuestro equipo de Postventa revisará los antecedentes y se pondrá en contacto contigo para coordinar el reemplazo del cuadro.",
  bodyManualReview: "Nuestro equipo de Postventa revisará los antecedentes y se pondrá en contacto contigo con el resultado de la revisión.",
  bodyPendingDatabase: "Una vez que Polygon Bikes confirme la base de números de serie, te notificaremos el resultado de la verificación y los pasos a seguir.",
  caseIdLabel: "Número de caso",
  serialLabel: "Número de serie",
  emailNotice: "Te enviamos un correo de confirmación con estos datos. Guarda tu número de caso para futuras consultas.",
  existingTitle: "YA EXISTE UNA SOLICITUD PARA ESTA BICICLETA",
  existingBody: "Este número de serie ya cuenta con un caso activo registrado con tus datos. No es necesario registrarlo nuevamente. Si necesitas actualizar información, contacta a nuestro equipo de Postventa indicando tu número de caso.",
  backHome: "Volver al inicio",
} as const;

export const STEPS = {
  title: "¿QUÉ SUCEDE AHORA?",
  items: [
    { n: "01", title: "Verifica tu bicicleta", body: "Ingresa el número de serie." },
    { n: "02", title: "Si está afectada, deja de utilizarla", body: "No vuelvas a montar la bicicleta." },
    { n: "03", title: "Registra tus antecedentes", body: "Completa el formulario." },
    { n: "04", title: "Cross Mountain te contactará", body: "Nuestro equipo de Postventa coordina el procedimiento." },
    { n: "05", title: "Reemplazo del cuadro", body: "Envías el cuadro afectado y recibes un cuadro de nueva versión." },
  ],
} as const;

export const SAFETY = {
  title: "INFORMACIÓN DE SEGURIDAD",
  p1: "Se han recibido reportes relacionados con una posible falla estructural en determinados cuadros Polygon Collosus DH.",
  p2: "Una falla estructural en la zona de la dirección puede provocar una pérdida repentina del control de la bicicleta y generar riesgo de caída y lesiones.",
  p3: "Si tu número de serie corresponde a una unidad incluida en esta campaña, no utilices la bicicleta.",
  p4: "No intentes reparar, soldar o modificar el cuadro por cuenta propia.",
} as const;

export const WHERE_SERIAL = {
  title: "¿DÓNDE ENCUENTRO MI NÚMERO DE SERIE?",
  body1: "El número de serie está grabado en la parte inferior del cuadro, bajo la caja del pedalier (donde se unen las bielas).",
  body2: "Gira la bicicleta o inclínala con cuidado para leerlo. Ingresa todos los caracteres tal como aparecen, sin espacios.",
  body3: "Si el número está parcialmente ilegible, ingresa lo que puedas leer y solicita una revisión manual adjuntando una foto.",
  figureAlt: "Polygon Collosus DH9 azul vista en tres cuartos. Un círculo rojo marca la parte inferior del cuadro, bajo la caja del pedalier, donde está grabado el número de serie.",
  markerLabel: "Número de serie: bajo la caja del pedalier",
  /** Serie ficticia con el formato de la lista de Polygon (una letra + 8 dígitos); no corresponde a ninguna bicicleta. */
  exampleLabel: "Ejemplo de número de serie",
  exampleSerial: "A25012345",
  exampleNote: "Por lo general, una letra seguida de 8 números. Es solo un ejemplo de formato: ingresa el número de tu bicicleta.",
} as const;

export const FAQ = {
  title: "PREGUNTAS FRECUENTES",
  items: [
    {
      q: "¿Por qué se está realizando este recall?",
      a: [
        "Se han recibido reportes relacionados con una posible falla estructural en determinados cuadros Polygon Collosus DH.",
        "Como medida preventiva, Polygon Bikes y Cross Mountain han iniciado esta campaña para identificar las unidades involucradas y reemplazar los cuadros afectados.",
      ],
    },
    {
      q: "¿Todas las Polygon Collosus DH están afectadas?",
      a: [
        "La campaña se está gestionando mediante los números de serie correspondientes a las unidades identificadas por Polygon Bikes.",
        "Ingresa el número de serie de tu bicicleta para verificarla.",
      ],
    },
    {
      q: "Mi bicicleta no tiene daños visibles. ¿Puedo seguir usándola?",
      a: ["Si tu número de serie corresponde a una unidad incluida en el recall, no debes utilizarla, aunque no presente daños visibles."],
    },
    {
      q: "¿Qué solución recibiré?",
      a: ["Las unidades afectadas recibirán el reemplazo del cuadro por una nueva versión proporcionada por Polygon Bikes. Para realizar el cambio, deberás enviarnos el cuadro afectado; nuestro equipo de Postventa te indicará cómo hacerlo."],
    },
    {
      q: "¿Tiene costo?",
      a: ["No. El reemplazo correspondiente a las unidades incluidas en esta campaña será realizado sin costo para el propietario."],
    },
    {
      q: "Compré mi bicicleta usada. ¿Puedo registrarla?",
      a: ["Sí. La campaña está asociada al número de serie de la bicicleta."],
    },
    {
      q: "No tengo la boleta original. ¿Puedo registrarme?",
      a: ["Sí. Puedes registrar tu bicicleta sin la boleta. Nuestro equipo de Postventa te indicará si se requiere algún antecedente adicional durante el proceso."],
    },
    {
      q: "Ya tuve una falla en mi cuadro",
      a: ["Deja de utilizar inmediatamente la bicicleta y registra tu caso indicando que existe daño."],
    },
    {
      q: "Tuve un accidente",
      a: ["Indícalo en el formulario y adjunta los antecedentes disponibles. Nuestro equipo de Postventa se pondrá en contacto contigo."],
    },
  ],
} as const;

export const CONTACT = {
  title: "¿NECESITAS AYUDA?",
  name: "Cross Mountain",
  channelsTitle: "Canales de contacto",
  /** Correo entregado por Cross Mountain (27-10-2026). La variable NEXT_PUBLIC_CONTACT_EMAIL, si se define, tiene prioridad. */
  defaultEmail: "contacto@crossmountain.cl",
  team: "Equipo de Postventa Polygon Chile",
  company: "Cross Mountain SpA",
  role: "Distribuidor Polygon Bikes en Chile",
  emailLabel: "Correo",
  whatsappLabel: "WhatsApp",
  hoursLabel: "Horario de atención",
  /** Se muestra cuando el dato aún no ha sido definido por Cross Mountain. NO inventar datos. */
  toDefine: "[POR DEFINIR]",
  pendingNotice: "Los canales de contacto se publicarán en breve.",
} as const;

export const FOOTER = {
  line1: "POLYGON BIKES × CROSS MOUNTAIN",
  line2: "COLLOSUS DH RECALL DE SEGURIDAD — CHILE",
  lastUpdated: "Última actualización",
  links: {
    privacy: "Aviso de privacidad",
    recallInfo: "Información del recall",
    contact: "Contacto",
    crossMountain: "Cross Mountain",
    polygon: "Polygon Bikes",
  },
  legal: "Este sitio es el portal oficial de verificación y registro de la campaña de recall de seguridad Polygon Collosus DH en Chile, operado por Cross Mountain SpA, distribuidor oficial de Polygon Bikes en Chile.",
} as const;

export const PRIVACY = {
  title: "AVISO DE PRIVACIDAD",
  intro: "Cross Mountain SpA recopila los datos de este formulario exclusivamente para gestionar la campaña de recall de seguridad Polygon Collosus DH en Chile.",
  sections: [
    {
      h: "Qué datos recopilamos",
      p: "Nombre, RUT, correo electrónico, teléfono, región y ciudad; número de serie, modelo, talla, lugar y fecha aproximada de compra de la bicicleta; fotografías que adjuntes; y la información que entregues sobre el estado del cuadro.",
    },
    {
      h: "Para qué los usamos",
      p: "Para verificar si tu bicicleta está incluida en la campaña, contactarte, coordinar el reemplazo del cuadro, mantener registro del proceso y reportar el avance de la campaña a Polygon Bikes de forma agregada.",
    },
    {
      h: "Quién accede a ellos",
      p: "Solo el equipo de Postventa de Cross Mountain y, cuando sea necesario para el reemplazo, Polygon Bikes. No compartimos tus datos con terceros para fines comerciales ni publicitarios.",
    },
    {
      h: "Cuánto tiempo los conservamos",
      p: "Durante la vigencia de la campaña y el plazo necesario para cumplir obligaciones legales y de garantía. [POR DEFINIR: plazo de retención a confirmar por Cross Mountain]",
    },
    {
      h: "Tus derechos",
      p: "Puedes solicitar acceso, rectificación o eliminación de tus datos escribiendo a nuestro equipo de Postventa (canal de contacto indicado en este sitio).",
    },
  ],
  reviewNotice: "[POR DEFINIR: redacción final sujeta a revisión legal de Cross Mountain antes del lanzamiento]",
} as const;

/** Textos de correos. */
export const EMAIL = {
  customerSubject: "Confirmación de registro — Recall Polygon Collosus DH",
  customerSubjectManualReview: "Solicitud de revisión recibida — Recall Polygon Collosus DH",
  customerSubjectPending: "Registro recibido — Recall Polygon Collosus DH",
  resultAffectedSubject: "IMPORTANTE: tu bicicleta está incluida en el recall — Polygon Collosus DH",
  resultNotIdentifiedSubject: "Resultado de verificación — Recall Polygon Collosus DH",
  internalSubject: (caseId: string, high: boolean) => `${high ? "[ALTA PRIORIDAD] " : ""}Nuevo caso ${caseId} — Recall Collosus DH`,
  greeting: (name: string) => `Hola ${name},`,
  stopRiding: "NO UTILICES LA BICICLETA hasta que se haya completado el procedimiento de reemplazo.",
  caseIdLabel: "Número de caso",
  serialLabel: "Número de serie",
  nextSteps: "Nuestro equipo de Postventa revisará los antecedentes y se pondrá en contacto contigo para coordinar el reemplazo del cuadro.",
  nextStepsManualReview: "Nuestro equipo de Postventa revisará los antecedentes y se pondrá en contacto contigo con el resultado de la revisión.",
  nextStepsPending: "Una vez que Polygon Bikes confirme la base de números de serie, te notificaremos el resultado de la verificación y los pasos a seguir.",
  keepCaseId: "Guarda este número de caso para futuras consultas.",
  siteLink: "Más información en",
  signature: "Equipo de Postventa Polygon Chile\nCross Mountain SpA — Distribuidor Polygon Bikes en Chile",
  footer: "Este es un correo automático de la campaña de recall de seguridad Polygon Collosus DH en Chile.",
} as const;

/** Etiquetas en español para estados técnicos (panel interno). */
export const STATUS_LABELS = {
  caseStatus: {
    REGISTERED: "Registrado",
    VALIDATED: "Validado",
    CUSTOMER_CONTACTED: "Cliente contactado",
    REPLACEMENT_FRAME_ASSIGNED: "Cuadro de reemplazo asignado",
    FRAME_IN_TRANSIT: "Cuadro en tránsito",
    FRAME_RECEIVED: "Cuadro recibido",
    SERVICE_SCHEDULED: "Servicio agendado",
    REPLACED: "Reemplazado",
    CLOSED: "Cerrado",
    MANUAL_REVIEW: "Revisión manual",
    INVALID_SERIAL: "Serie inválida",
    DUPLICATE_CASE: "Caso duplicado",
    CUSTOMER_UNREACHABLE: "Cliente no contactable",
  },
  verification: {
    AFFECTED: "Unidad afectada",
    REINFORCED: "No afectada (OK)",
    NOT_IDENTIFIED: "No identificada",
    UNVERIFIED: "No verificable",
    PENDING_DATABASE: "Pendiente (base no cargada)",
  },
  lookupResult: {
    AFFECTED: "Afectada",
    REINFORCED: "No afectada",
    NOT_IDENTIFIED: "No encontrada",
    INVALID: "Formato inválido",
    PENDING_DATABASE: "Pendiente (base no cargada)",
    RATE_LIMITED: "Bloqueada por límite",
  },
  requestType: {
    REPLACEMENT: "Reemplazo de cuadro",
    MANUAL_REVIEW: "Revisión manual",
    PENDING_DATABASE: "Registro interino",
  },
  priority: { NORMAL: "Normal", HIGH: "Alta" },
  model: { COLLOSUS_DH7: "Collosus DH7", COLLOSUS_DH9: "Collosus DH9", NOT_SURE: "No indicado" },
  size: { S: "S", M: "M", L: "L", XL: "XL", NOT_SURE: "No indicada" },
  tri: { YES: "Sí", NO: "No", NOT_SURE: "No está seguro/a" },
  fileKind: {
    SERIAL_PHOTO: "Foto del número de serie",
    BIKE_PHOTO: "Foto de la bicicleta",
    HEADTUBE_PHOTO: "Foto de la dirección",
    ADDITIONAL: "Foto adicional",
  },
  serialDatabase: { PENDING: "Pendiente (modo interino)", COMPLETE: "Cargada y validada" },
} as const;

export const COMMON = {
  skipToContent: "Ir al contenido principal",
  loading: "Cargando…",
  close: "Cerrar",
  yes: "Sí",
  no: "No",
  notFoundTitle: "PÁGINA NO ENCONTRADA",
  notFoundBody: "La página que buscas no existe. Vuelve al inicio para verificar tu bicicleta.",
  errorTitle: "OCURRIÓ UN ERROR",
  errorBody: "Ocurrió un problema inesperado. Inténtalo nuevamente en unos minutos.",
  retry: "Reintentar",
  backHome: "Volver al inicio",
} as const;

/** Textos adicionales del verificador (verificación humana / anti-abuso). */
export const RESULT_TURNSTILE = {
  title: "CONFIRMA QUE ERES UNA PERSONA",
  body: "Por seguridad, antes de continuar necesitamos una verificación rápida.",
  unavailableTitle: "VERIFICACIONES LIMITADAS TEMPORALMENTE",
  unavailableBody: "Por seguridad, hemos limitado temporalmente las verificaciones desde tu conexión. Espera unos minutos e inténtalo nuevamente, o contacta a nuestro equipo de Postventa.",
  failed: "No pudimos completar la verificación de seguridad. Inténtalo nuevamente.",
} as const;

/** Textos adicionales del flujo (enlaces secundarios, estados intermedios). */
export const FLOW = {
  manualFromInvalid: "¿El número aparece así en el cuadro? Solicita una verificación manual",
  verifiedSerialLabel: "Serie ingresada",
  serialEditableHint: "Corrige el número si es necesario, tal como aparece en el cuadro.",
  resultRegionLabel: "Resultado de la verificación",
  formRegionLabel: "Formulario de registro",
  successRegionLabel: "Confirmación de registro",
  stepsRegionLabel: "Pasos de la campaña",
  modelLabel: "Modelo",
  sizeLabel: "Talla",
  filesSelected: (n: number) => (n === 1 ? "1 archivo seleccionado" : `${n} archivos seleccionados`),
  noFileSelected: "Ningún archivo seleccionado",
  chooseFile: "Seleccionar archivo",
  chooseFiles: "Seleccionar archivos",
  formErrorsTitle: "Revisa los siguientes puntos:",
  privacyLinkText: "aviso de privacidad",
  externalLink: "(enlace externo)",
  devPageTitle: "Estados de la interfaz (solo desarrollo)",
  compact: {
    AFFECTED: "Unidad afectada · No utilices la bicicleta",
    PENDING_DATABASE: "Verificación pendiente",
    MANUAL_REVIEW: "Revisión manual",
    REINFORCED: "No afectada · Revisión de daño",
  },
} as const;

/** Modelos incluidos en la campaña (confirmados por Cross Mountain el 27-10-2026: Collosus DH7 y Collosus DH9). */
export const MODELS = {
  title: "MODELOS INCLUIDOS EN LA CAMPAÑA",
  intro: "La campaña abarca los modelos Polygon Collosus DH7 y Collosus DH9. La inclusión de cada unidad se confirma mediante su número de serie.",
  note: "Verifica el número de serie aunque tu bicicleta no presente daños visibles.",
  items: [
    {
      key: "dh7",
      name: "Collosus DH7",
      description: "Cuadro negro con logotipo dorado.",
      image: "/modelos/collosus-dh7.webp",
      alt: "Polygon Collosus DH7, bicicleta de descenso con cuadro negro y logotipo dorado",
    },
    {
      key: "dh9",
      name: "Collosus DH9",
      description: "Cuadro azul con logotipo dorado.",
      image: "/modelos/collosus-dh9.webp",
      alt: "Polygon Collosus DH9, bicicleta de descenso con cuadro azul y logotipo dorado",
    },
  ],
  photoPending: "Fotografía oficial pendiente",
} as const;
