import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, text, timestamp, boolean, integer, jsonb, bigint } from 'drizzle-orm/pg-core';
import type { EntryContent, SiteSettings } from './types';
export function secret(name: string, env: string): string {
  if (process.env[env]) return process.env[env]!;
  const file = path.join(process.env.SECRETS_DIR || '.local/secrets', name);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
}
export const users = pgTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  singleton: boolean().notNull().default(true).unique(),
});
export const sessions = pgTable('session', {
  id: text().primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});
export const accounts = pgTable('account', {
  id: text().primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const verifications = pgTable('verification', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const rateLimits = pgTable('rate_limit', {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
export const systemState = pgTable('system_state', {
  id: integer().primaryKey(),
  ownerId: text('owner_id'),
  setupComplete: boolean('setup_complete').notNull().default(false),
});
export const settings = pgTable('settings', {
  id: integer().primaryKey(),
  value: jsonb().$type<SiteSettings>().notNull(),
});
export const entries = pgTable('entries', {
  id: text().primaryKey(),
  kind: text().notNull(),
  content: jsonb().$type<EntryContent>().notNull(),
  published: jsonb().$type<EntryContent>(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  version: integer().notNull().default(1),
});
export const taxonomies = pgTable('taxonomies', {
  id: text().primaryKey(),
  kind: text().notNull(),
  name: text().notNull(),
  slug: text().notNull(),
});
export const media = pgTable('media', {
  id: text().primaryKey(),
  name: text().notNull(),
  alt: text().notNull().default(''),
  mime: text().notNull(),
  size: integer().notNull(),
  width: integer().notNull(),
  height: integer().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const schema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  rateLimit: rateLimits,
  systemState,
  settings,
  entries,
  taxonomies,
  media,
};
let pool: pg.Pool | undefined;
export function getPool() {
  return (pool ||= new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://kaiyo:${encodeURIComponent(secret('pg-password', 'POSTGRES_PASSWORD'))}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/kaiyolab`,
    max: 10,
    connectionTimeoutMillis: 5000,
  }));
}
export function db() {
  return drizzle(getPool(), { schema });
}
