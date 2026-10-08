import type { Metadata } from "next"

import { CenteredCardShell } from "@/components/layouts/centered-card-shell"

// See app/(master)/layout.tsx: noindex, not Disallow.
export const metadata: Metadata = {
  robots: { index: false },
}

export default function CheckoutLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <CenteredCardShell>{children}</CenteredCardShell>
}
