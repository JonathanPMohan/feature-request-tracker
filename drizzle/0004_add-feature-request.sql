CREATE TABLE "feature_request" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "feature_request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_request_status_valid" CHECK ("feature_request"."status" IN ('open', 'planned', 'in_progress', 'shipped', 'declined')),
	CONSTRAINT "feature_request_title_valid" CHECK (btrim("feature_request"."title") <> '' and char_length("feature_request"."title") <= 120),
	CONSTRAINT "feature_request_description_valid" CHECK (btrim("feature_request"."description") <> '' and char_length("feature_request"."description") <= 5000)
);
--> statement-breakpoint
ALTER TABLE "feature_request" ADD CONSTRAINT "feature_request_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_request_author_id_idx" ON "feature_request" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "feature_request_status_created_at_idx" ON "feature_request" USING btree ("status","created_at");