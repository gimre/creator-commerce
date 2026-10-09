import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from 'better-auth/api';
import { expireCookie } from 'better-auth/cookies';
import { nextCookies } from 'better-auth/next-js';
import { mcp } from 'better-auth/plugins';

import { appOrigins, appUrl } from '@/lib/server/app-url';
import { isValidHandle } from '@/lib/schemas/auth';
import { deleteUserOAuthTokens } from '@/lib/server/dal/oauth-clients';
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
  // getMcpSession (plugins/mcp/index.mjs) answers with the whole
  // oauth_access_token row, refreshToken included, and is mounted at
  // /mcp/get-session with no auth of its own. withMcpAuth calls
  // auth.api.getMcpSession(...) directly — the generated endpoint, not the
  // router — so it is unaffected: disabledPaths is only checked in the
  // router's onRequest (api/index.mjs), which is the HTTP dispatch path
  // (app/api/auth/[...all]/route.ts), never auth.api.* calls. This closes
  // the only way a bearer token holder could read their own refresh token
  // over HTTP without otherwise affecting token verification.
  disabledPaths: ['/mcp/get-session'],
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
    // revokeSessionsOnPasswordReset only touches sessions, never the
    // oauth_access_token rows an MCP client holds — those survive a reset
    // untouched otherwise. The same "someone else has access" reasoning
    // applies: a reset exists to lock out whoever else had it, including a
    // client that authorized itself before the reset.
    onPasswordReset: ({ user }) => deleteUserOAuthTokens(user.id),
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
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // An MCP client registers itself and picks its own name, so the user's
      // Allow is the only check on it. The mcp plugin shows its consent page
      // only when the authorize request carries prompt=consent — compared
      // exactly, so it is set rather than appended — and most MCP clients
      // never send it. Setting it here, before the plugin reads the query,
      // also covers the signed-out path: the plugin stores this query in a
      // cookie on its way to /login and replays it after sign-in.
      //
      // Narrowing scope lives in the same hook because it has to run before
      // the same read: no tool a connected client can reach — Cece's own —
      // needs the caller's email or name, and the spec promises a client
      // never receives either. Keeping only openid (identifies the user to
      // the client) and offline_access (refresh tokens) means /mcp/token's
      // id_token carries no email or name claims no matter what a client
      // requests — mcp/index.mjs's userClaims only adds its profile/email
      // fields when those scopes are present in what was actually granted.
      async function forceConsentOnAuthorize() {
        if (ctx.path !== '/mcp/authorize') return;
        // A client can repeat `?scope=` in the query string, and depending
        // on how the framework parsed it ctx.query.scope then arrives as an
        // array rather than a string — `.split` throws on an array. Taking
        // the first value mirrors how a single scope is read everywhere else
        // in this pipeline (authorize.mjs's own `query.scope?.split(' ')`).
        const rawScope = ctx.query?.scope;
        const scopeParam = (Array.isArray(rawScope) ? rawScope[0] : rawScope) ?? '';
        const requested = scopeParam.split(' ').filter(Boolean);
        const allowed = requested.filter(
          (scope: string) => scope === 'openid' || scope === 'offline_access',
        );
        const scope = (allowed.length > 0 ? allowed : ['openid']).join(' ');
        return {
          context: { query: { ...ctx.query, prompt: 'consent', scope } },
        };
      }

      // The consent forced above stores requireConsent: true on the pending
      // code until /oauth2/consent flips it to false on Allow (see
      // oidc-provider/index.mjs's oAuthConsent handler). But /mcp/token's own
      // exchange (mcpOAuthToken in better-auth/dist/plugins/mcp/index.mjs)
      // never reads that flag — only /oauth2/consent does. So a client
      // holding a code's PKCE verifier and the consent_code shown in the
      // /oauth/consent URL (leaked via Referer, logs or analytics) could
      // redeem it at /mcp/token before anyone clicks Allow. Reject it here,
      // with the same invalid_grant shape the token endpoint itself uses for
      // a bad code, so a legitimate exchange — which always runs after
      // requireConsent has been cleared — is unaffected.
      async function refuseUnconsentedToken() {
        if (ctx.path !== '/mcp/token') return;
        if (ctx.body?.grant_type !== 'authorization_code') return;
        const code = ctx.body?.code;
        if (typeof code !== 'string') return;
        const verification =
          await ctx.context.internalAdapter.findVerificationValue(code);
        if (!verification) return;
        const value = JSON.parse(verification.value) as {
          requireConsent?: boolean;
        };
        // Fails closed: every legitimate code carries an explicit boolean —
        // oidc-provider sets requireConsent: false on Allow
        // (oidc-provider/index.mjs) and authorize.mjs sets it to a boolean
        // (query.prompt === 'consent') on every code it creates, consented
        // or not. Checking !== false, not the truthy check this replaced,
        // means a future library upgrade that renames or drops the field
        // rejects the code instead of silently treating a missing flag as
        // consent given.
        if (value.requireConsent !== false) {
          throw new APIError('UNAUTHORIZED', {
            error_description: 'invalid code',
            error: 'invalid_grant',
          });
        }
      }

      // /oauth2/consent (oAuthConsent in oidc-provider/index.mjs) only checks
      // that *a* session exists (its `use: [sessionMiddleware]`) — it never
      // compares the pending code's userId with the caller's. So a leaked
      // consent_code (Referer, logs, analytics) lets any signed-in user Allow
      // someone else's authorization, and the client ends up with a code bound
      // to that other person's account. Resolves the code exactly as the
      // endpoint does — ctx.body.consent_code, falling back to the signed
      // oidc_consent_prompt cookie — and on a mismatch throws the same
      // "Invalid code" shape the endpoint itself throws for an unknown or
      // expired code, so a probe can't tell "not yours" from "invalid". The
      // endpoint's sessionMiddleware hasn't run yet at this point in the
      // pipeline, so the session is resolved here with getSessionFromCtx, the
      // same helper the mcp plugin's own authorize handler uses.
      async function refuseForeignConsent() {
        if (ctx.path !== '/oauth2/consent') return;
        let code =
          typeof ctx.body?.consent_code === 'string'
            ? ctx.body.consent_code
            : null;
        if (!code) {
          const cookieValue = await ctx.getSignedCookie(
            'oidc_consent_prompt',
            ctx.context.secret,
          );
          if (typeof cookieValue === 'string') code = cookieValue;
        }
        if (!code) return;
        const verification =
          await ctx.context.internalAdapter.findVerificationValue(code);
        if (!verification) return;
        const value = JSON.parse(verification.value) as { userId?: string };
        const session = await getSessionFromCtx(ctx);
        if (!session) return;
        if (value.userId !== session.user.id) {
          throw new APIError('UNAUTHORIZED', {
            error_description: 'Invalid code',
            error: 'invalid_request',
          });
        }
      }

      // handle is an input field (user.additionalFields), so Better Auth
      // takes whatever string a client sends; the form's `pattern` is only
      // the browser's courtesy. A handle lands in urls, share cards and the
      // sitemap's XML, so the rule is enforced here, on both endpoints that
      // can set it. ctx.body is the router's parsed body at this point (the
      // endpoint's own schema validation hasn't run yet), and an APIError
      // thrown from a before hook reaches the router's catch and becomes the
      // response (better-call's router.mjs). A missing handle on
      // /update-user is an update that doesn't change it; on /sign-up/email
      // the field is required: true and the endpoint rejects it itself.
      async function refuseInvalidHandle() {
        if (ctx.path !== '/sign-up/email' && ctx.path !== '/update-user') return;
        const handle: unknown = ctx.body?.handle;
        if (handle === undefined) return;
        if (typeof handle !== 'string' || !isValidHandle(handle)) {
          throw new APIError('BAD_REQUEST', {
            message:
              'Handle must be 3–30 characters: lowercase letters, numbers, - or _.',
          });
        }
      }

      await refuseInvalidHandle();

      return (
        (await forceConsentOnAuthorize()) ??
        (await refuseUnconsentedToken()) ??
        (await refuseForeignConsent())
      );
    }),
    after: createAuthMiddleware(async (ctx) => {
      // The plugin stores a pending authorization in this cookie on its way
      // to /login and resumes it from inside the next sign-in or sign-up
      // response — as a 302 that fetch() follows silently, so the browser
      // never leaves the form and the authorization is lost. Expiring the
      // cookie switches that off; the login and signup pages carry the
      // authorize params instead and navigate back to /mcp/authorize
      // themselves (lib/schemas/auth.ts, oauthAuthorizeQuery).
      async function expireLoginPromptCookie() {
        if (ctx.path !== '/mcp/authorize') return;
        expireCookie(ctx, {
          name: 'oidc_login_prompt',
          attributes: { path: '/' },
        });
      }

      // The library never rotates a refresh token on use (the refresh grant
      // in mcp/index.mjs inserts a new oauthAccessToken row and leaves the
      // old one's refreshToken valid until it expires on its own, 7 days
      // later) — so a refresh token that leaked once would keep working in
      // parallel with the legitimate client for up to a week. Deleting the
      // presented token's row after a successful exchange closes that: the
      // next use of the same old token finds no row and fails, while the
      // newly issued row (a different refreshToken value, inserted before
      // this hook runs) survives untouched. ctx.context.returned is the
      // endpoint's resolved response at this point in the pipeline
      // (api/dispatch.mjs sets it right before running after-hooks); a
      // thrown APIError — a bad or reused token, a client mismatch — ends
      // up there too, so isAPIError is what tells a successful exchange from
      // a rejected one.
      async function rotateRefreshTokenOnUse() {
        if (ctx.path !== '/mcp/token') return;
        if (ctx.body?.grant_type !== 'refresh_token') return;
        if (isAPIError(ctx.context.returned)) return;
        const presentedToken = ctx.body?.refresh_token;
        if (typeof presentedToken !== 'string') return;
        await ctx.context.adapter.delete({
          model: 'oauthAccessToken',
          where: [{ field: 'refreshToken', value: presentedToken }],
        });
      }

      await expireLoginPromptCookie();
      await rotateRefreshTokenOnUse();
    }),
  },
  plugins: [
    // Makes this app an OAuth 2.1 authorization server for MCP clients
    // (Claude, ChatGPT, Cursor…): dynamic client registration, PKCE, tokens.
    // /api/mcp checks those tokens with withMcpAuth.
    mcp({
      loginPage: '/login',
      oidcConfig: {
        loginPage: '/login',
        consentPage: '/oauth/consent',
        requirePKCE: true,
        // Does not close /mcp/register, the endpoint MCP clients actually
        // hit (its registration_endpoint metadata points there): that route
        // never checks this flag and is always open. It only gates
        // oidc-provider's own /oauth2/register, which nothing here uses.
        allowDynamicClientRegistration: true,
      },
    }),
    // nextCookies must be the last plugin: it lets server actions set
    // auth cookies via next/headers.
    nextCookies(),
  ],
});
