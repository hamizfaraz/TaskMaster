CREATE TABLE "nebula_course_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_prefix" text,
	"course_number" text,
	"course_title" text,
	"section_number" text,
	"academic_session_name" text,
	"academic_session_start_date" text,
	"academic_session_end_date" text,
	"professor_names" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"professor_emails" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"instruction_mode" text,
	"meeting_summary" text,
	"syllabus_uri" text,
	"raw" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabus_parse_cache" (
	"content_hash" text PRIMARY KEY NOT NULL,
	"parse_status" text DEFAULT 'processing' NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"parse_model" text NOT NULL,
	"gemini_file_uri" text,
	"nebula_section_id" text,
	"nebula_match_confidence" double precision,
	"parsed_payload" jsonb,
	"merged_payload" jsonb,
	"error_message" text,
	"warnings" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "syllabus_parse_cache" ADD CONSTRAINT "syllabus_parse_cache_nebula_section_id_nebula_course_sections_id_fk" FOREIGN KEY ("nebula_section_id") REFERENCES "public"."nebula_course_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nebula_course_sections_course_idx" ON "nebula_course_sections" USING btree ("subject_prefix","course_number");--> statement-breakpoint
CREATE INDEX "nebula_course_sections_session_idx" ON "nebula_course_sections" USING btree ("academic_session_name");--> statement-breakpoint
CREATE INDEX "syllabus_parse_cache_status_idx" ON "syllabus_parse_cache" USING btree ("parse_status");--> statement-breakpoint
CREATE INDEX "syllabus_parse_cache_nebula_section_idx" ON "syllabus_parse_cache" USING btree ("nebula_section_id");