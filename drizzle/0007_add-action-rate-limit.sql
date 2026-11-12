CREATE TABLE "action_rate_limit" (
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "action_rate_limit_user_id_action_pk" PRIMARY KEY("user_id","action"),
	CONSTRAINT "action_rate_limit_action_valid" CHECK ("action_rate_limit"."action" in ('submit', 'vote', 'comment')),
	CONSTRAINT "action_rate_limit_count_valid" CHECK ("action_rate_limit"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "action_rate_limit" ADD CONSTRAINT "action_rate_limit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;