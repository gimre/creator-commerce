import { notFound } from "next/navigation"

import { getUserByHandle } from "@/lib/server/dal/users"
import { StorefrontShell } from "@/components/layouts/storefront-shell"
import { parseHandleSegment } from "@/lib/utils"

export default async function StorefrontLayout({
  params,
  children,
}: LayoutProps<"/[handle]">) {
  const { handle } = await params
  const seller = await getUserByHandle(parseHandleSegment(handle))
  if (!seller) {
    notFound()
  }

  return <StorefrontShell seller={seller}>{children}</StorefrontShell>
}
