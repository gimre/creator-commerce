import 'server-only'

import { emailTheme } from '@/lib/email-theme.generated'
import { SITE_NAME } from '@/lib/site'

export const OG_SIZE = { width: 1200, height: 630 }

// Satori parses neither oklch() nor var(), exactly like an email client, and
// the generated email theme is already the palette in hex.
export const ogColors = emailTheme.colors

// The chrome every card shares: page background, a small wordmark, and the
// card's own content below it. Satori needs display: flex on any element with
// more than one child.
export function OgFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 64,
        background: ogColors.background,
        color: ogColors.foreground,
        fontFamily: 'Body',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'Heading', fontSize: 30 }}>
        <div style={{ width: 22, height: 22, borderRadius: 999, background: ogColors.primary }} />
        {SITE_NAME}
      </div>
      <div style={{ display: 'flex', flex: 1, marginTop: 40 }}>{children}</div>
    </div>
  )
}
