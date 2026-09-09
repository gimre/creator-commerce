import 'server-only'

import { after } from 'next/server'

/**
 * The one place this app calls after().
 *
 * after() defers work until the response has been sent and, on a serverless
 * platform, extends the invocation through waitUntil so the work cannot be torn
 * down half-finished. That last part is the reason it exists here: the receipt
 * used to be a bare un-awaited promise, which a runtime is free to kill the
 * moment it returns the response.
 *
 * It throws outside a request scope, which is what confines this module — and
 * everything else that calls after(), headers(), cookies() or revalidatePath() —
 * to lib/server/request/.
 */

/**
 * Defer past the response, and never let the deferred work escape.
 *
 * Swallowing is deliberate and matches what fulfillCheckoutSession already did:
 * a dead SMTP connection — or an unreachable analytics endpoint — must not turn
 * a fulfilled order into a 500, because Stripe would then retry for three days
 * against a state that will never resolve. The rows are already promoted and
 * the retry promotes nothing.
 *
 * `prefix` is the log channel, `context` whatever identifies the work in a log:
 * the order id, a user id.
 */
function scheduleAfterResponse(
  task: () => Promise<void>,
  prefix: string,
  context: string,
): void {
  after(async () => {
    try {
      await task()
    } catch (error) {
      console.error(`[${prefix}] ${context} failed`, error)
    }
  })
}

export function scheduleEmail(
  task: () => Promise<void>,
  context: string,
): void {
  scheduleAfterResponse(task, 'email', context)
}

/**
 * Separate from scheduleEmail only for the log prefix, which is worth having:
 * a missing receipt and a missing analytics event are different problems with
 * different urgencies, and grepping should tell them apart.
 */
export function scheduleAnalytics(
  task: () => Promise<void>,
  context: string,
): void {
  scheduleAfterResponse(task, 'analytics', context)
}

/**
 * Better Auth's advanced.backgroundTasks.handler.
 *
 * Passed a promise rather than a callback, which after() accepts directly. No
 * catch of its own: Better Auth attaches one and logs before it ever calls this
 * (create-context.mjs), so a second would only duplicate the line.
 *
 * Without this wired up, Better Auth awaits its email hooks inline and every
 * signup, reset request and resend blocks on the SMTP handshake.
 */
export function scheduleBackgroundTask(promise: Promise<unknown>): void {
  after(promise)
}
