import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import { appOrigins, appUrl } from '@/lib/server/app-url';
import db from '@/lib/server/db';
import * as authSchema from '@/lib/server/db/schemas/auth';
import {
  sendEmailVerification,
  sendPasswordResetEmail,
} from '@/lib/server/email/auth';
import { scheduleBackgroundTask } from '@/lib/server/request/background';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  // Explicit rather than left to the BETTER_AUTH_URL env fallback, which
  // cannot name a preview deployment's host. trustedOrigins is what makes a
  // preview usable: a request on the unique deployment host while baseURL is
  // the branch alias would otherwise fail the origin check with
  // "Invalid origin".
  baseURL: appUrl,
  trustedOrigins: appOrigins,
  advanced: {
    // Better Auth awaits its email hooks inline unless a handler is set, so
    // without this every signup and reset request blocks on the SMTP handshake.
    // after() is the handler because it also holds a serverless invocation open
    // past the response, which a bare un-awaited promise would not.
    //
    // Deliberately not omitted in order to surface send failures to the user:
    // runInBackgroundOrAwait try/catches around both of its branches, so these
    // endpoints answer status: true whether or not the mail left. Awaiting would
    // buy latency and an SMTP-duration timing signal on forgot-password, and no
    // error reporting at all. /send-verification-email is the exception — it
    // awaits and rethrows on its own, which is why the resend button on
    // /verify-email can report a real failure.
    backgroundTasks: { handler: scheduleBackgroundTask },
  },
  emailAndPassword: {
    enabled: true,
    // requireEmailVerification is deliberately unset. Every existing row has
    // emailVerified: false, so turning the gate on locks out every account; the
    // banner in DashboardShell is the nudge until that is dealt with.
    sendResetPassword: ({ user, url }) => sendPasswordResetEmail({ user, url }),
    // Better Auth defaults this to false. The usual reason to reset a password
    // is that someone else has access, and leaving their existing session alive
    // through the reset that is meant to lock them out defeats the point.
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    // Clicking a link in your own inbox mints a session, which is what a magic
    // link is. The token is single-use and expires in an hour, and the
    // alternative is bouncing a just-verified user to /login to retype a
    // password that whoever holds that inbox could reset anyway.
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) =>
      sendEmailVerification({ user, url }),
  },
  user: {
    additionalFields: {
      handle: { type: 'string', required: true, unique: true, input: true },
      // Shown on the storefront. Optional — an account is usable without one.
      bio: { type: 'string', required: false, input: true },
    },
  },
  // Better Auth defaults rate-limit storage to in-memory, which is fine on a
  // single long-running process but not on serverless: each instance keeps its
  // own counter, so the real request rate against forgot-password and
  // send-verification-email is the per-instance limit times however many
  // instances are warm. Both endpoints trigger mail through a Gmail App
  // Password capped near 500/day, so under-counting there is the risk, not a
  // convenience. Database storage shares one counter across instances.
  rateLimit: { storage: 'database' },
  // nextCookies must be the last plugin: it lets server actions set
  // auth cookies via next/headers.
  plugins: [nextCookies()],
});
