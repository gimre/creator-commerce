import type { Metadata } from "next"

import { DashboardShell } from "@/components/layouts/dashboard-shell"

// Signed-in pages: nothing here belongs in a search index. noindex rather than
// a robots.txt Disallow — a disallowed url can still be indexed from inbound
// links, and a crawler only sees noindex on a page it may fetch.
export const metadata: Metadata = {
  robots: { index: false },
}

export default function MasterLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <DashboardShell>{children}</DashboardShell>
}
