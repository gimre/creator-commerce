/**
 * Regenerates lib/server/db/schemas/auth.ts from the Better Auth config.
 *
 * Does the job of `npx @better-auth/cli generate`, but in-process. The CLI
 * binary loads the config through jiti, which resolves `server-only` to the
 * module that throws on import and gives up there. jiti honours neither
 * --conditions nor JITI_ALIAS, and takes its aliases from tsconfig `paths`,
 * where an entry for `server-only` would disable the marker for the Next build
 * and `tsc` as well. tsx does honour --conditions=react-server, which is the
 * condition server-only's own exports map points at its empty module.
 *
 * .mts rather than .ts, and not for style: the drizzle generator decides
 * whether a column gets .defaultNow() by stringifying the field's default and
 * looking for `new Date()` in the source text. A .ts entry makes tsx run the
 * whole graph through esbuild's CJS output, where that function prints as
 * `()=>new Date` — same behaviour, no parentheses, no match, and every
 * timestamp default silently drops out of the generated schema.
 */
import { writeFile } from 'node:fs/promises'

import type { DBAdapter } from '@better-auth/cli/api'
import { generateDrizzleSchema } from '@better-auth/cli/api'
import type { BetterAuthOptions } from '@better-auth/core'

import { auth } from '@/lib/server/auth'

const OUTPUT = 'lib/server/db/schemas/auth.ts'

async function main() {
  const { adapter } = await auth.$context
  const { code } = await generateDrizzleSchema({
    // @better-auth/cli pins @better-auth/core 1.4.21 and better-auth 1.6.24
    // carries its own copy, both exact, so nothing dedupes them and the
    // generator's BetterAuthOptions is a different type from the one behind
    // `auth` — over the same runtime object, which the generator only reads.
    adapter: adapter as unknown as DBAdapter,
    options: auth.options as unknown as BetterAuthOptions,
    file: OUTPUT,
  })

  // The generator returns no code when what is on disk already matches.
  if (!code) {
    console.log(`${OUTPUT} is up to date`)
    return
  }

  await writeFile(OUTPUT, code)
  console.log(`wrote ${OUTPUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
