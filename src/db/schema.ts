/**
 * Esquema de base de datos (Drizzle ORM, dialecto PostgreSQL).
 * Funciona igual sobre PostgreSQL/Supabase (producción) y PGlite (desarrollo).
 *
 * Nombres técnicos en inglés por convención de código; todo texto visible
 * al usuario final vive en `src/lib/copy/es.ts`.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────

/** Resultado de la verificación de un número de serie. */
export const SERIAL_VERIFICATION_STATUSES = [
  "AFFECTED", // coincidencia exacta con la base oficial de Polygon (tanda afectada)
  "REINFORCED", // coincidencia exacta con una unidad de la tanda reforzada (no incluida en la campaña)
  "NOT_IDENTIFIED", // base completa cargada y no aparece
  "UNVERIFIED", // formato inválido / no se pudo verificar
  "PENDING_DATABASE", // base de Polygon aún no cargada (modo interino)
] as const;
export type SerialVerificationStatus = (typeof SERIAL_VERIFICATION_STATUSES)[number];
export const serialVerificationStatusEnum = pgEnum("serial_verification_status", SERIAL_VERIFICATION_STATUSES);

/** Estados operativos de un caso (máquina de estados simple). */
export const CASE_STATUSES = [
  "REGISTERED",
  "VALIDATED",
  "CUSTOMER_CONTACTED",
  "REPLACEMENT_FRAME_ASSIGNED",
  "FRAME_IN_TRANSIT",
  "FRAME_RECEIVED",
  "SERVICE_SCHEDULED",
  "REPLACED",
  "CLOSED",
  // Estados de excepción
  "MANUAL_REVIEW",
  "INVALID_SERIAL",
  "DUPLICATE_CASE",
  "CUSTOMER_UNREACHABLE",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const caseStatusEnum = pgEnum("case_status", CASE_STATUSES);

/** Estados considerados "activos" para detección de duplicados. */
export const ACTIVE_CASE_STATUSES: readonly CaseStatus[] = [
  "REGISTERED",
  "VALIDATED",
  "CUSTOMER_CONTACTED",
  "REPLACEMENT_FRAME_ASSIGNED",
  "FRAME_IN_TRANSIT",
  "FRAME_RECEIVED",
  "SERVICE_SCHEDULED",
  "MANUAL_REVIEW",
  "DUPLICATE_CASE",
  "CUSTOMER_UNREACHABLE",
];

export const REQUEST_TYPES = [
  "REPLACEMENT", // serie afectada → inicio de reemplazo
  "MANUAL_REVIEW", // serie no identificada / no verificable → revisión manual
  "PENDING_DATABASE", // registro en modo interino (base no cargada)
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const requestTypeEnum = pgEnum("request_type", REQUEST_TYPES);

export const PRIORITIES = ["NORMAL", "HIGH"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const priorityEnum = pgEnum("priority", PRIORITIES);

export const BIKE_MODELS = ["COLLOSUS_DH7", "COLLOSUS_DH9", "NOT_SURE"] as const;
export type BikeModel = (typeof BIKE_MODELS)[number];
export const bikeModelEnum = pgEnum("bike_model", BIKE_MODELS);

export const BIKE_SIZES = ["S", "M", "L", "XL", "NOT_SURE"] as const;
export type BikeSize = (typeof BIKE_SIZES)[number];
export const bikeSizeEnum = pgEnum("bike_size", BIKE_SIZES);

export const TRI_STATE = ["YES", "NO", "NOT_SURE"] as const;
export type TriState = (typeof TRI_STATE)[number];
export const triStateEnum = pgEnum("tri_state", TRI_STATE);

export const FILE_KINDS = ["SERIAL_PHOTO", "BIKE_PHOTO", "HEADTUBE_PHOTO", "ADDITIONAL"] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const fileKindEnum = pgEnum("file_kind", FILE_KINDS);

export const LOOKUP_RESULTS = ["AFFECTED", "REINFORCED", "NOT_IDENTIFIED", "INVALID", "PENDING_DATABASE", "RATE_LIMITED"] as const;
export type LookupResult = (typeof LOOKUP_RESULTS)[number];
export const lookupResultEnum = pgEnum("lookup_result", LOOKUP_RESULTS);

// ── Tablas ─────────────────────────────────────────────────────────────

/**
 * Base oficial de números de serie afectados (suministrada por Polygon).
 * NUNCA se expone al cliente. Solo consultas server-side por coincidencia exacta.
 */
export const affectedSerials = pgTable(
  "affected_serials",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Serie normalizada (mayúsculas, sin espacios). Clave de búsqueda. */
    serialNumber: text("serial_number").notNull(),
    /** Serie tal como vino en el archivo de Polygon. */
    serialRaw: text("serial_raw").notNull(),
    model: text("model"),
    size: text("size"),
    productionBatch: text("production_batch"),
    /** Estado dentro de la campaña: "RECALL" (tanda afectada), "REINFORCED" (tanda reforzada) o "EXCLUDED". */
    status: text("status").notNull().default("RECALL"),
    importId: integer("import_id").references(() => serialImports.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("affected_serials_serial_number_idx").on(t.serialNumber)],
);

/** Registro de cada importación de la base de series. */
export const serialImports = pgTable("serial_imports", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  importedBy: text("imported_by").notNull().default("system"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Caso de recall (una solicitud registrada por un propietario). */
export const recallCases = pgTable(
  "recall_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Identificador público, formato RCDH-XXXXX. */
    caseId: text("case_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    // Cliente
    customerName: text("customer_name").notNull(),
    rut: text("rut").notNull(), // normalizado: sin puntos, con guion, DV en mayúscula
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    region: text("region").notNull(),
    city: text("city").notNull(),

    // Bicicleta
    serialNumber: text("serial_number").notNull(), // normalizado
    serialRaw: text("serial_raw").notNull(),
    model: bikeModelEnum("model").notNull(),
    size: bikeSizeEnum("size").notNull(),
    dealer: text("dealer"),
    purchaseDate: text("purchase_date"), // fecha aproximada, texto libre (ej. "marzo 2026")

    // Verificación / tipo
    serialVerificationStatus: serialVerificationStatusEnum("serial_verification_status").notNull(),
    requestType: requestTypeEnum("request_type").notNull(),
    priority: priorityEnum("priority").notNull().default("NORMAL"),
    caseStatus: caseStatusEnum("case_status").notNull().default("REGISTERED"),

    // Incidentes
    damageReported: triStateEnum("damage_reported").notNull(),
    accidentReported: boolean("accident_reported").notNull().default(false),
    incidentDescription: text("incident_description"),
    acknowledgedStopRiding: boolean("acknowledged_stop_riding").notNull().default(false),

    // Reemplazo
    replacementFrameSerial: text("replacement_frame_serial"),
    replacementFrameVersion: text("replacement_frame_version"),
    assignedTo: text("assigned_to"),

    // Operación / auditoría
    source: text("source").notNull().default("WEB"),
    /** Código del enlace personal del correo de aviso (?r=…), si el cliente llegó por él. */
    outreachRef: text("outreach_ref"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    /** Última vez que se notificó al cliente el resultado de la verificación (reproceso). */
    resultNotifiedAt: timestamp("result_notified_at", { withTimezone: true }),
    /** Último correo de seguimiento al cliente (cambio de etapa, novedad semanal o comunicado). */
    lastCustomerUpdateAt: timestamp("last_customer_update_at", { withTimezone: true }),
    /** Última llamada de Postventa al cliente (marcada desde la mesa de control). */
    lastCallAt: timestamp("last_call_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("recall_cases_case_id_idx").on(t.caseId),
    index("recall_cases_serial_number_idx").on(t.serialNumber),
    index("recall_cases_email_idx").on(t.email),
    index("recall_cases_rut_idx").on(t.rut),
    index("recall_cases_case_status_idx").on(t.caseStatus),
    index("recall_cases_created_at_idx").on(t.createdAt),
  ],
);

/** Archivos adjuntos a un caso (claves de almacenamiento, nunca URLs públicas). */
export const caseFiles = pgTable(
  "case_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => recallCases.id, { onDelete: "cascade" }),
    kind: fileKindEnum("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("case_files_case_id_idx").on(t.caseId)],
);

/** Notas internas de Postventa. */
export const caseNotes = pgTable(
  "case_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => recallCases.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("case_notes_case_id_idx").on(t.caseId)],
);

/** Bitácora de auditoría (cambios de estado, notificaciones, importaciones, accesos admin). */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").references(() => recallCases.id, { onDelete: "set null" }),
    type: text("type").notNull(), // ej. CASE_CREATED, STATUS_CHANGED, EMAIL_SENT, SERIALS_IMPORTED, ADMIN_LOGIN
    actor: text("actor").notNull().default("system"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_case_id_idx").on(t.caseId), index("audit_events_created_at_idx").on(t.createdAt)],
);

/**
 * Bandeja de correo (mesa de control): todo correo enviado a un cliente y todo correo recibido
 * en la casilla de Postventa. Los estados de entrega llegan por webhook de Resend.
 */
export const EMAIL_DIRECTIONS = ["IN", "OUT"] as const;
export type EmailDirection = (typeof EMAIL_DIRECTIONS)[number];
/** OUT: SENT → DELIVERED (o DELAYED), y terminales BOUNCED / COMPLAINED / FAILED. IN: RECEIVED. */
export const EMAIL_STATUSES = ["SENT", "DELAYED", "DELIVERED", "BOUNCED", "COMPLAINED", "FAILED", "RECEIVED"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
/** Prioridad de un correo entrante (análisis automático). */
export const MESSAGE_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number];

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").references(() => recallCases.id, { onDelete: "set null" }),
    direction: text("direction").$type<EmailDirection>().notNull(),
    /** OUT: tipo de envío (CUSTOMER_FOLLOW_UP, MANUAL_REPLY…). IN: CUSTOMER_MESSAGE. */
    kind: text("kind").notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    /** Id del proveedor (Resend): enlaza los webhooks de entrega y evita duplicar entrantes. */
    providerId: text("provider_id"),
    status: text("status").$type<EmailStatus>().notNull(),
    statusDetail: text("status_detail"),
    statusAt: timestamp("status_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    attachments: jsonb("attachments").$type<{ id?: string; filename: string | null; contentType: string; size?: number }[]>(),
    // Solo entrantes
    priority: text("priority").$type<MessagePriority>(),
    triageReason: text("triage_reason"),
    triageSource: text("triage_source"),
    readAt: timestamp("read_at", { withTimezone: true }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    handledBy: text("handled_by"),
    actor: text("actor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_messages_provider_id_idx").on(t.providerId),
    index("email_messages_case_id_idx").on(t.caseId),
    index("email_messages_created_at_idx").on(t.createdAt),
    index("email_messages_from_email_idx").on(t.fromEmail),
  ],
);

/** Registro de consultas de serie (métricas + detección de enumeración). Sin IP en claro. */
export const serialLookups = pgTable(
  "serial_lookups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serialNormalized: text("serial_normalized").notNull(),
    result: lookupResultEnum("result").notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    /** Correo que deja quien consulta una serie afectada, antes de ver el resultado. */
    contactEmail: text("contact_email"),
    contactAt: timestamp("contact_at", { withTimezone: true }),
    /** Código del enlace personal del correo de aviso (?r=…); la relación código → persona vive fuera de la BD. */
    outreachRef: text("outreach_ref"),
    /** Recordatorio automático (24 h) a quien dejó su correo con una serie afectada y no registró caso. */
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("serial_lookups_created_at_idx").on(t.createdAt), index("serial_lookups_ip_hash_idx").on(t.ipHash)],
);

/** Eventos de analítica interna. Solo nombre de evento + fecha. Nunca PII. */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analytics_events_name_idx").on(t.name), index("analytics_events_created_at_idx").on(t.createdAt)],
);

/**
 * Hits de los límites de tasa (ventana deslizante). Compartido entre todas las instancias
 * serverless; `key` es siempre un hash (nunca una IP en claro). Las filas viejas se purgan solas.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limit_hits_lookup_idx").on(t.bucket, t.key, t.createdAt), index("rate_limit_hits_created_at_idx").on(t.createdAt)],
);

/** Configuración operativa (clave/valor). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

/** Claves de configuración conocidas. */
export const SETTING_KEYS = {
  /** "PENDING" (modo interino, sin base de Polygon) | "COMPLETE" (base oficial cargada y validada). */
  SERIAL_DATABASE_STATUS: "serial_database_status",
} as const;
export const SERIAL_DATABASE_STATUSES = ["PENDING", "COMPLETE"] as const;
export type SerialDatabaseStatus = (typeof SERIAL_DATABASE_STATUSES)[number];

// ── Tipos inferidos ────────────────────────────────────────────────────
export type AffectedSerial = typeof affectedSerials.$inferSelect;
export type NewAffectedSerial = typeof affectedSerials.$inferInsert;
export type RecallCase = typeof recallCases.$inferSelect;
export type NewRecallCase = typeof recallCases.$inferInsert;
export type CaseFile = typeof caseFiles.$inferSelect;
export type NewCaseFile = typeof caseFiles.$inferInsert;
export type CaseNote = typeof caseNotes.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type SerialLookup = typeof serialLookups.$inferSelect;
export type SerialImport = typeof serialImports.$inferSelect;
export type EmailMessageRow = typeof emailMessages.$inferSelect;
