import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './lib/server/db/schemas',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.PG_CONNECTION_STRING as string,
  },
});
