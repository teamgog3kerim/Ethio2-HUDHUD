import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const visitorPageviews = pgTable("visitor_pageviews", {
  pageViewId: uuid("page_view_id").primaryKey(),
  visitorId: uuid("visitor_id").notNull(),
  path: text("path").notNull(),
  audience: text("audience").notNull().default("unclassified"),
  country: text("country").notNull().default("XX"),
  device: text("device").notNull().default("unknown"),
  browser: text("browser").notNull().default("other"),
  language: text("language").notNull().default("other"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("visitor_pageviews_created_idx").on(table.createdAt),
  index("visitor_pageviews_visitor_created_idx").on(table.visitorId, table.createdAt),
  index("visitor_pageviews_audience_created_idx").on(table.audience, table.createdAt),
]);

export const insertVisitorPageviewSchema = createInsertSchema(visitorPageviews);
export type VisitorPageview = typeof visitorPageviews.$inferSelect;
