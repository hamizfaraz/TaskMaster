CREATE TABLE "quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"user_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"score" double precision NOT NULL,
	"correct_count" integer NOT NULL,
	"answered_count" integer NOT NULL,
	"question_count" integer NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"time_spent_seconds" integer,
	"mode" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"source_note_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"source_note_titles" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"questions" jsonb NOT NULL,
	"question_count" integer NOT NULL,
	"difficulty" text NOT NULL,
	"mode" text NOT NULL,
	"question_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"time_limit_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_id_idx" ON "quiz_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_created_at_idx" ON "quiz_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "quizzes_user_id_idx" ON "quizzes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quizzes_created_at_idx" ON "quizzes" USING btree ("created_at");