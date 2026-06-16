CREATE TABLE "mind_map" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"source_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mind_map_edge" (
	"id" text PRIMARY KEY NOT NULL,
	"map_id" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"label" text,
	"is_suggested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mind_map_node" (
	"id" text PRIMARY KEY NOT NULL,
	"map_id" text NOT NULL,
	"label" text NOT NULL,
	"position_x" double precision DEFAULT 0 NOT NULL,
	"position_y" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mind_map" ADD CONSTRAINT "mind_map_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_map_edge" ADD CONSTRAINT "mind_map_edge_map_id_mind_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."mind_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_map_edge" ADD CONSTRAINT "mind_map_edge_source_node_id_mind_map_node_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."mind_map_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_map_edge" ADD CONSTRAINT "mind_map_edge_target_node_id_mind_map_node_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."mind_map_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_map_node" ADD CONSTRAINT "mind_map_node_map_id_mind_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."mind_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mind_map_user_id_idx" ON "mind_map" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mind_map_edge_map_id_idx" ON "mind_map_edge" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "mind_map_edge_source_node_id_idx" ON "mind_map_edge" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "mind_map_edge_target_node_id_idx" ON "mind_map_edge" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "mind_map_node_map_id_idx" ON "mind_map_node" USING btree ("map_id");