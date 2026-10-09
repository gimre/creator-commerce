import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// next/font exposes nothing Satori can load, so the cards read their own TTFs
// (static weights: Satori does not handle variable fonts). The family names
// are what OgFrame's fontFamily values refer to.
//
// Each path is written out in full inside its readFile call, the shape the
// Next docs use, so the build's file tracer can resolve it statically; a
// directory held in a module-level const is easier for it to lose. The
// outputFileTracingIncludes entry in next.config.ts is the guarantee either
// way.
export async function loadOgFonts() {
  const [heading, body] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/Roboto-Medium.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/NunitoSans-Regular.ttf')),
  ])
  return [
    { name: 'Heading', data: heading, weight: 500 as const, style: 'normal' as const },
    { name: 'Body', data: body, weight: 400 as const, style: 'normal' as const },
  ]
}
