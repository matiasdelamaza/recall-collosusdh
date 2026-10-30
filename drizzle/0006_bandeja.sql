CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_emails" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"provider_id" text,
	"status" text NOT NULL,
	"status_detail" text,
	"status_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"attachments" jsonb,
	"priority" text,
	"triage_reason" text,
	"triage_source" text,
	"read_at" timestamp with time zone,
	"handled_at" timestamp with time zone,
	"handled_by" text,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recall_cases" ADD COLUMN "last_call_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_case_id_recall_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."recall_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_provider_id_idx" ON "email_messages" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "email_messages_case_id_idx" ON "email_messages" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "email_messages_created_at_idx" ON "email_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_messages_from_email_idx" ON "email_messages" USING btree ("from_email");