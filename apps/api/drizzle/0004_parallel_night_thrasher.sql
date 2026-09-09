CREATE TYPE "public"."appointment_status" AS ENUM('REQUESTED', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."call_direction" AS ENUM('INBOUND', 'OUTBOUND', 'WEB_TEST');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('ACTIVE', 'COMPLETED', 'FAILED', 'MISSED');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"call_session_id" uuid,
	"customer_name" varchar(255) NOT NULL,
	"customer_phone" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"resource_name" varchar(255),
	"booking_date" varchar(50) NOT NULL,
	"booking_time" varchar(50) NOT NULL,
	"status" "appointment_status" DEFAULT 'REQUESTED' NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"room_name" varchar(255) NOT NULL,
	"caller_number" varchar(50),
	"direction" "call_direction" DEFAULT 'INBOUND' NOT NULL,
	"status" "call_status" DEFAULT 'COMPLETED' NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"primary_language" varchar(50) DEFAULT 'en-IN',
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"transcript_text" text,
	"turns_json" jsonb,
	"tools_used" jsonb,
	"metrics_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"call_session_id" uuid,
	"customer_name" varchar(255) NOT NULL,
	"customer_phone" varchar(50) NOT NULL,
	"customer_email" varchar(255),
	"interest_category" varchar(255),
	"status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid,
	"deployment_id" uuid,
	"phone_number" varchar(50) NOT NULL,
	"provider" varchar(50) DEFAULT 'plivo' NOT NULL,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phone_numbers_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_tenant_idx" ON "appointments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "appointments_agent_idx" ON "appointments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "appointments_call_session_idx" ON "appointments" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "appointments_booking_date_idx" ON "appointments" USING btree ("booking_date");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointments_created_at_idx" ON "appointments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "call_sessions_tenant_idx" ON "call_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "call_sessions_agent_idx" ON "call_sessions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "call_sessions_deployment_idx" ON "call_sessions" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "call_sessions_created_at_idx" ON "call_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "call_sessions_caller_number_idx" ON "call_sessions" USING btree ("caller_number");--> statement-breakpoint
CREATE INDEX "call_sessions_status_idx" ON "call_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_tenant_idx" ON "leads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "leads_agent_idx" ON "leads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "leads_call_session_idx" ON "leads" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_customer_phone_idx" ON "leads" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "phone_numbers_tenant_idx" ON "phone_numbers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "phone_numbers_agent_idx" ON "phone_numbers" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "phone_numbers_deployment_idx" ON "phone_numbers" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "phone_numbers_phone_idx" ON "phone_numbers" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "phone_numbers_status_idx" ON "phone_numbers" USING btree ("status");