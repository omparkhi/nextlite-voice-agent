DO $$ BEGIN
    CREATE TYPE "follow_up_status" AS ENUM('PENDING', 'SENT', 'DELIVERED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"lead_id" uuid REFERENCES "leads"("id") ON DELETE SET NULL,
	"appointment_id" uuid REFERENCES "appointments"("id") ON DELETE SET NULL,
	"call_session_id" uuid REFERENCES "call_sessions"("id") ON DELETE SET NULL,
	"customer_name" varchar(255),
	"customer_phone" varchar(50) NOT NULL,
	"channel" varchar(50) DEFAULT 'WHATSAPP' NOT NULL,
	"provider" varchar(50) DEFAULT 'DEMO' NOT NULL,
	"message_type" varchar(50) DEFAULT 'CUSTOM' NOT NULL,
	"message_text" text NOT NULL,
	"status" "follow_up_status" DEFAULT 'SENT' NOT NULL,
	"provider_message_id" varchar(255),
	"is_demo" boolean DEFAULT true NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"failed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follow_ups_tenant_idx" ON "follow_ups" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follow_ups_customer_phone_idx" ON "follow_ups" ("customer_phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follow_ups_created_at_idx" ON "follow_ups" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follow_ups_status_idx" ON "follow_ups" ("status");
