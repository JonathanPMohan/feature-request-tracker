// The data model: Jonathan writes this file (see CLAUDE.md).
//
// M3: Better Auth adds its tables here, and you add `role` to the user table.
// M4: you design requests, votes, comments, and rate limits.
//
// After changing this file: npm run db:generate, review the SQL in drizzle/, npm run db:migrate.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  primaryKey,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const featureRequest = pgTable(
  "feature_request",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("open"),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "feature_request_status_valid",
      sql`${table.status} IN ('open', 'planned', 'in_progress', 'shipped', 'declined')`,
    ),
    check(
      "feature_request_title_valid",
      sql`${table.title} ~ '[^[:space:]]' and char_length(${table.title}) <= 120`,
    ),
    check(
      "feature_request_description_valid",
      sql`${table.description} ~ '[^[:space:]]' and char_length(${table.description}) <= 5000`,
    ),
    index("feature_request_author_id_idx").on(table.authorId),
    index("feature_request_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const vote = pgTable(
  "vote",
  {
    requestId: integer("request_id")
      .notNull()
      .references(() => featureRequest.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.userId] }),
    index("vote_user_id_idx").on(table.userId),
  ],
);

export const comment = pgTable(
  "comment",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    requestId: integer("request_id")
      .notNull()
      .references(() => featureRequest.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // One random key per comment form, so the same key twice is the same comment.
    submissionKey: uuid("submission_key").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "comment_body_valid",
      sql`${table.body} ~ '[^[:space:]]' and char_length(${table.body}) <= 2000`,
    ),
    index("comment_request_id_created_at_idx").on(
      table.requestId,
      table.createdAt,
    ),
    // One comment per author per key. Its index also covers lookups by author,
    // including the cascade when a user is deleted.
    unique("comment_author_submission_key_unique").on(
      table.authorId,
      table.submissionKey,
    ),
  ],
);

export const actionRateLimit = pgTable(
  "action_rate_limit",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.action] }),
    check(
      "action_rate_limit_action_valid",
      sql`${table.action} in ('submit', 'vote', 'comment')`,
    ),
    check("action_rate_limit_count_valid", sql`${table.count} >= 0`),
  ],
);
