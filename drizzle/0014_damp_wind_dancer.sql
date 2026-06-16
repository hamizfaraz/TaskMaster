CREATE TABLE "spaced_rep_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"note_id" text NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp with time zone NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"review_count" integer DEFAULT 0 NOT NULL,
	"total_study_seconds" integer DEFAULT 0 NOT NULL,
	"last_rating" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spaced_rep_entry" ADD CONSTRAINT "spaced_rep_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaced_rep_entry" ADD CONSTRAINT "spaced_rep_entry_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spaced_rep_entry_user_note_idx" ON "spaced_rep_entry" USING btree ("user_id","note_id");--> statement-breakpoint
CREATE INDEX "spaced_rep_entry_user_id_idx" ON "spaced_rep_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spaced_rep_entry_next_review_idx" ON "spaced_rep_entry" USING btree ("next_review_at");