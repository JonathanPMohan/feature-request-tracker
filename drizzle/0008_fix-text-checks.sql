ALTER TABLE "comment" DROP CONSTRAINT "comment_body_valid";--> statement-breakpoint
ALTER TABLE "feature_request" DROP CONSTRAINT "feature_request_title_valid";--> statement-breakpoint
ALTER TABLE "feature_request" DROP CONSTRAINT "feature_request_description_valid";--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_body_valid" CHECK ("comment"."body" ~ '[^[:space:]]' and char_length("comment"."body") <= 2000);--> statement-breakpoint
ALTER TABLE "feature_request" ADD CONSTRAINT "feature_request_title_valid" CHECK ("feature_request"."title" ~ '[^[:space:]]' and char_length("feature_request"."title") <= 120);--> statement-breakpoint
ALTER TABLE "feature_request" ADD CONSTRAINT "feature_request_description_valid" CHECK ("feature_request"."description" ~ '[^[:space:]]' and char_length("feature_request"."description") <= 5000);