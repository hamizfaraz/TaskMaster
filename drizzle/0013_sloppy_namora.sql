ALTER TABLE "note" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "note_deleted_at_idx" ON "note" USING btree ("deleted_at");