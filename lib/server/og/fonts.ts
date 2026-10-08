import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// next/font exposes nothing Satori can load, so the cards read their own TTFs
// (static weights: Satori does not handle variable fonts). The family names
// are what OgFrame's fontFamily values refer to.
const FONTS_DIR = join(process.cwd(), 'assets/fonts')

export async function loadOgFonts() {
  const [heading, body] = await Promise.all([
    readFile(join(FONTS_DIR, 'Roboto-Medium.ttf')),
    readFile(join(FONTS_DIR, 'NunitoSans-Regular.ttf')),
  ])
  return [
    { name: 'Heading', data: heading, weight: 500 as const, style: 'normal' as const },
    { name: 'Body', data: body, weight: 400 as const, style: 'normal' as const },
  ]
}
