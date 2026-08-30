import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const visits = pgTable('visits', {
  id: serial('id').primaryKey(),
  path: text('path').notNull(),
  visitedAt: timestamp('visited_at').defaultNow().notNull(),
});

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
