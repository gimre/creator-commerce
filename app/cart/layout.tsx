import type { Metadata } from "next"

import { CartShell } from "@/components/layouts/cart-shell"

// See app/(master)/layout.tsx: noindex, not Disallow.
export const metadata: Metadata = {
  robots: { index: false },
}

export default function CartLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <CartShell>{children}</CartShell>
}
