import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Empties every table in the app's schema ("public") so each test starts clean.
 *
 * TRUNCATE is much faster than DELETE for this. RESTART IDENTITY resets
 * auto-incrementing IDs, and CASCADE empties tables linked by foreign keys
 * together. Drizzle's migration records live in the separate "drizzle" schema,
 * so they're kept.
 */
export async function resetDatabase<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
): Promise<void> {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;

  // sql.identifier quotes each name safely, so an odd table name can't break the statement.
  const tables = sql.join(
    rows.map(
      (row) =>
        sql`${sql.identifier("public")}.${sql.identifier(row.tablename)}`,
    ),
    sql`, `,
  );
  await db.execute(sql`truncate table ${tables} restart identity cascade`);
}
