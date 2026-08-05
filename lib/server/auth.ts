import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import db from '@/lib/server/db';
import * as authSchema from '@/lib/server/db/schemas/auth';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      handle: { type: 'string', required: true, unique: true, input: true },
      // Shown on the storefront. Optional — an account is usable without one.
      bio: { type: 'string', required: false, input: true },
    },
  },
  // nextCookies must be the last plugin: it lets server actions set
  // auth cookies via next/headers.
  plugins: [nextCookies()],
});
