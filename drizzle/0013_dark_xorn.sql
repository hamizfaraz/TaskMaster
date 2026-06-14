CREATE TABLE "cheat_sheet" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"content" jsonb,
	"markdown" text DEFAULT '' NOT NULL,
	"class_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cheat_sheet" ADD CONSTRAINT "cheat_sheet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheat_sheet" ADD CONSTRAINT "cheat_sheet_class_id_parse_test_course_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."parse_test_course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cheat_sheet_user_id_idx" ON "cheat_sheet" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cheat_sheet_class_id_idx" ON "cheat_sheet" USING btree ("class_id");