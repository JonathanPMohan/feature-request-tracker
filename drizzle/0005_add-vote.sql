CREATE TABLE "vote" (
	"request_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vote_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_request_id_feature_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."feature_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vote_user_id_idx" ON "vote" USING btree ("user_id");